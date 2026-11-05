import type { ApplyResult } from "@jobia/connectors";
import { and, applications, eq, jobOffers, sql, transitionApplication } from "@jobia/db";
import type { JobPayloads } from "@jobia/queue";
import { DelayedError, type Job } from "bullmq";
import type { WorkerContext } from "../context";
import { GmailAuthError } from "../infra/gmail";
import { loadSubject, permanent, type AgentSubject } from "./common";

type OfferRow = typeof jobOffers.$inferSelect;
type AppRow = typeof applications.$inferSelect;

/**
 * Delivers one application, through the channel of the offer:
 *  - email      → personalised email from the user's Gmail + CV attached
 *  - easy_apply → LinkedIn Easy Apply in the user's browser session
 *  - site_form  → the job board's own application form
 */
export async function processSubmit(ctx: WorkerContext, data: JobPayloads["submit"], job: Job, token?: string): Promise<void> {
  const { userId, applicationId } = data;
  const [row] = await ctx.db
    .select({ app: applications, offer: jobOffers })
    .from(applications)
    .innerJoin(jobOffers, eq(jobOffers.id, applications.jobOfferId))
    .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
    .limit(1);
  if (!row || row.app.status !== "queued") return; // withdrawn, already sent, or replay

  const subject = await loadSubject(ctx, userId);
  if (!subject) permanent("User has no parsed CV");
  if (subject.preferences.agentMode === "paused") return;

  // Daily caps: postpone (not fail) until tomorrow when reached.
  if (!(await ctx.quota.tryConsume(userId, row.offer.source, subject.preferences.maxApplicationsPerDay))) {
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 5 + Math.floor(Math.random() * 120), 0, 0);
    await job.moveToDelayed(tomorrow.getTime(), token);
    throw new DelayedError();
  }

  const started = await transitionApplication(ctx.db, {
    applicationId,
    userId,
    to: "submitting",
    actor: "agent",
    message: `Envoi de la candidature via ${row.offer.source}`,
  });
  if (!started.applied) {
    await ctx.quota.release(userId, row.offer.source);
    return;
  }
  await ctx.db.update(applications).set({ attempts: sql`${applications.attempts} + 1` }).where(eq(applications.id, applicationId));

  let result: ApplyResult;
  try {
    result =
      row.offer.applyChannel === "email"
        ? await sendByEmail(ctx, subject, row.app, row.offer)
        : await applyInBrowser(ctx, subject, row.offer);
  } catch (error) {
    if (error instanceof GmailAuthError) {
      await ctx.secrets.markNeedsReauth(userId, "google", error.message);
      result = { status: "needs_user_action", reason: "Reconnectez votre compte Google" };
    } else {
      await ctx.quota.release(userId, row.offer.source);
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await transitionApplication(ctx.db, {
        applicationId,
        userId,
        to: isLastAttempt ? "failed" : "queued",
        actor: "system",
        message: isLastAttempt ? "Échec définitif de l'envoi" : "Erreur temporaire, nouvelle tentative prévue",
        patch: { lastError: String(error).slice(0, 500) },
      });
      throw error;
    }
  }

  await recordResult(ctx, subject, row.app, row.offer, result, job.attemptsMade + 1 >= (job.opts.attempts ?? 1));
}

async function recordResult(
  ctx: WorkerContext,
  s: AgentSubject,
  app: AppRow,
  offer: OfferRow,
  result: ApplyResult,
  isLastAttempt: boolean,
) {
  const base = { applicationId: app.id, userId: s.user.id, actor: "agent" as const };
  switch (result.status) {
    case "submitted":
    case "already_applied":
      await transitionApplication(ctx.db, {
        ...base,
        to: "submitted",
        message: result.status === "submitted" ? `Candidature envoyée à ${offer.company}` : "Déjà postulé sur cette offre",
        patch: { submittedAt: new Date(), lastError: null },
      });
      return;
    case "needs_user_action":
      await ctx.quota.release(s.user.id, offer.source);
      await transitionApplication(ctx.db, {
        ...base,
        to: "needs_user_action",
        message: result.reason,
        patch: { pendingQuestions: result.pendingQuestions ?? [] },
      });
      return;
    case "offer_closed":
      await ctx.quota.release(s.user.id, offer.source);
      await transitionApplication(ctx.db, { ...base, to: "failed", message: "L'offre n'est plus disponible", patch: { lastError: "offer_closed" } });
      return;
    case "failed":
      await ctx.quota.release(s.user.id, offer.source);
      if (result.retryable && !isLastAttempt) {
        // Back to `queued` so the BullMQ retry (exponential backoff) can pick it up again.
        await transitionApplication(ctx.db, { ...base, to: "queued", message: "Nouvelle tentative prévue", patch: { lastError: result.reason } });
        throw new Error(result.reason);
      }
      await transitionApplication(ctx.db, { ...base, to: "failed", message: result.reason, patch: { lastError: result.reason } });
  }
}

async function sendByEmail(ctx: WorkerContext, s: AgentSubject, app: AppRow, offer: OfferRow): Promise<ApplyResult> {
  if (!offer.applyEmail) return { status: "failed", reason: "Aucune adresse email sur l'offre", retryable: false };
  const mailbox = await ctx.secrets.gmail(s.user.id);
  if (!mailbox) return { status: "needs_user_action", reason: "Autorisez l'envoi d'emails depuis Gmail" };

  const email = await ctx.ai.writer.writeEmail(s.cv.profile, offer);
  const sent = await mailbox.send({
    from: { name: s.user.name, email: s.user.email },
    to: offer.applyEmail,
    subject: email.subject,
    text: email.body,
    attachment: { fileName: s.cv.fileName, mimeType: s.cv.mimeType, content: await ctx.files.read(s.cv.storageKey) },
  });
  await ctx.db
    .update(applications)
    .set({ coverLetter: email.body, emailThreadId: sent.threadId })
    .where(eq(applications.id, app.id));
  return { status: "submitted", confirmation: sent.messageId };
}

async function applyInBrowser(ctx: WorkerContext, s: AgentSubject, offer: OfferRow): Promise<ApplyResult> {
  const connector = ctx.connectors.get(offer.source);
  if (!connector) return { status: "failed", reason: `Source ${offer.source} désactivée`, retryable: false };
  const provider = offer.source as Exclude<OfferRow["source"], "email">;
  const integration = await ctx.secrets.load(s.user.id, provider);
  if (!integration) return { status: "needs_user_action", reason: `Connectez votre compte ${connector.displayName}` };

  const coverLetter = offer.applyChannel === "site_form" ? (await ctx.ai.writer.writeEmail(s.cv.profile, offer)).body : null;

  return ctx.browsers.withSession(integration.session, async (session) => {
    const page = await session.context.newPage();
    const connectorCtx = {
      page,
      credentials: JSON.parse(integration.secret) as { login: string; password: string },
      logger: {
        info: (m: string, d?: Record<string, unknown>) => ctx.logger.info(d ?? {}, m),
        warn: (m: string, d?: Record<string, unknown>) => ctx.logger.warn(d ?? {}, m),
      },
    };
    const login = await connector.login(connectorCtx);
    if (login.status !== "ok") {
      const reason = login.status === "challenge" ? login.reason : "Identifiants refusés";
      await ctx.secrets.markNeedsReauth(s.user.id, provider, reason);
      return { status: "needs_user_action", reason } satisfies ApplyResult;
    }

    const result = await ctx.files.withLocalCopy(s.cv.storageKey, s.cv.fileName, (cvFilePath) =>
      connector.apply(connectorCtx, offer, {
        fullName: s.cv.profile.fullName,
        email: s.cv.profile.email ?? s.user.email,
        phone: s.cv.profile.phone,
        cvFilePath,
        coverLetter,
        answerQuestions: (questions) => ctx.ai.forms.answer(s.cv.profile, s.user.savedAnswers, questions),
      }),
    );
    await ctx.secrets.saveSession(s.user.id, provider, await session.exportState());
    return result;
  });
}
