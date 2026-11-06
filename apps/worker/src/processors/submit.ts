import type { ApplyResult } from "@jobia/connectors";
import { and, applications, eq, jobOffers, sql, transitionApplication } from "@jobia/db";
import type { JobPayloads } from "@jobia/queue";
import { capFor, PLANS, type ApplyChannel } from "@jobia/shared";
import { DelayedError, type Job } from "bullmq";
import type { WorkerContext } from "../context";
import { GmailAuthError } from "../infra/gmail";
import { loadSubject, permanent, type AgentSubject } from "./common";

type OfferRow = typeof jobOffers.$inferSelect;
type AppRow = typeof applications.$inferSelect;

/** What happened to one application, whatever the channel. */
export type SubmitOutcome =
  | (Extract<ApplyResult, { status: "submitted" }> & { via: ApplyChannel; message: string })
  | Exclude<ApplyResult, { status: "submitted" }>
  /** Easy Apply offer with no recruiter email: the user applies on LinkedIn with one click. */
  | { status: "user_to_apply"; coverLetter: string };

/**
 * Delivers one application, through the best available channel:
 *  - email      → personalised email from the user's Gmail + CV attached
 *  - site_form  → the job board's own application form (browser worker)
 *  - easy_apply → never automated on LinkedIn: the agent looks for the
 *                 recruiter's published email and applies by email; if there
 *                 is none, the user gets a one-click "Postuler sur LinkedIn".
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

  // Daily caps (plan limit + user preference): postpone (not fail) until tomorrow when reached.
  const dailyCap = capFor(PLANS[subject.user.plan].dailyApplications, subject.preferences.maxApplicationsPerDay);
  if (!(await ctx.quota.tryConsume(userId, row.offer.source, dailyCap))) {
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
    message: `Préparation de la candidature (${row.offer.source})`,
  });
  if (!started.applied) {
    await ctx.quota.release(userId, row.offer.source);
    return;
  }
  await ctx.db.update(applications).set({ attempts: sql`${applications.attempts} + 1` }).where(eq(applications.id, applicationId));

  const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  let outcome: SubmitOutcome;
  try {
    outcome = await deliver(ctx, subject, row.app, row.offer);
  } catch (error) {
    if (error instanceof GmailAuthError) {
      await ctx.secrets.markNeedsReauth(userId, "google", error.message);
      outcome = { status: "needs_user_action", reason: "Reconnectez votre compte Google" };
    } else {
      await ctx.quota.release(userId, row.offer.source);
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

  await recordOutcome(ctx, subject, row.app, row.offer, outcome, isLastAttempt);
}

async function deliver(ctx: WorkerContext, s: AgentSubject, app: AppRow, offer: OfferRow): Promise<SubmitOutcome> {
  switch (offer.applyChannel) {
    case "email": {
      if (!offer.applyEmail) return { status: "failed", reason: "Aucune adresse email sur l'offre", retryable: false };
      return sendByEmail(ctx, s, app, offer, offer.applyEmail, `Candidature envoyée par email à ${offer.company}`);
    }
    case "easy_apply": {
      const contact = await ctx.contacts.resolve(offer);
      if (contact) {
        const where = contact.foundVia === "offer_text" ? "dans l'offre" : `sur ${new URL(contact.sourceUrl).hostname}`;
        return sendByEmail(ctx, s, app, offer, contact.email, `Email RH trouvé ${where} : candidature envoyée à ${contact.email}`);
      }
      // No published recruiter address: prepare everything, the user clicks "Postuler" on LinkedIn.
      const letter = await ctx.ai.writer.writeEmail(s.cv.profile, offer);
      return { status: "user_to_apply", coverLetter: letter.body };
    }
    case "site_form": {
      const result = await applyInBrowser(ctx, s, offer);
      return result.status === "submitted"
        ? { ...result, via: "site_form", message: `Candidature envoyée sur ${offer.source}` }
        : result;
    }
  }
}

async function recordOutcome(
  ctx: WorkerContext,
  s: AgentSubject,
  app: AppRow,
  offer: OfferRow,
  outcome: SubmitOutcome,
  isLastAttempt: boolean,
) {
  const base = { applicationId: app.id, userId: s.user.id, actor: "agent" as const };
  const release = () => ctx.quota.release(s.user.id, offer.source);

  switch (outcome.status) {
    case "submitted":
      await transitionApplication(ctx.db, {
        ...base,
        to: "submitted",
        message: outcome.message,
        patch: { submittedAt: new Date(), lastError: null, appliedVia: outcome.via },
      });
      return;
    case "already_applied":
      await transitionApplication(ctx.db, { ...base, to: "submitted", message: "Déjà postulé sur cette offre", patch: { submittedAt: new Date() } });
      return;
    case "user_to_apply":
      await release(); // nothing was sent by the agent
      await transitionApplication(ctx.db, {
        ...base,
        to: "user_to_apply",
        message: "Aucun email RH publié : candidature prête, à envoyer en un clic sur LinkedIn",
        patch: { coverLetter: outcome.coverLetter, appliedVia: "easy_apply" },
      });
      return;
    case "needs_user_action":
      await release();
      await transitionApplication(ctx.db, {
        ...base,
        to: "needs_user_action",
        message: outcome.reason,
        patch: { pendingQuestions: outcome.pendingQuestions ?? [] },
      });
      return;
    case "offer_closed":
      await release();
      await transitionApplication(ctx.db, { ...base, to: "failed", message: "L'offre n'est plus disponible", patch: { lastError: "offer_closed" } });
      return;
    case "failed":
      await release();
      if (outcome.retryable && !isLastAttempt) {
        // Back to `queued` so the BullMQ retry (exponential backoff) can pick it up again.
        await transitionApplication(ctx.db, { ...base, to: "queued", message: "Nouvelle tentative prévue", patch: { lastError: outcome.reason } });
        throw new Error(outcome.reason);
      }
      await transitionApplication(ctx.db, { ...base, to: "failed", message: outcome.reason, patch: { lastError: outcome.reason } });
  }
}

async function sendByEmail(
  ctx: WorkerContext,
  s: AgentSubject,
  app: AppRow,
  offer: OfferRow,
  to: string,
  message: string,
): Promise<SubmitOutcome> {
  const mailbox = await ctx.secrets.gmail(s.user.id);
  if (!mailbox) return { status: "needs_user_action", reason: "Autorisez l'envoi d'emails depuis Gmail" };

  const email = await ctx.ai.writer.writeEmail(s.cv.profile, offer);
  const sent = await mailbox.send({
    from: { name: s.user.name, email: s.user.email },
    to,
    subject: email.subject,
    text: email.body,
    attachment: { fileName: s.cv.fileName, mimeType: s.cv.mimeType, content: await ctx.files.read(s.cv.storageKey) },
  });
  await ctx.db
    .update(applications)
    .set({ coverLetter: email.body, emailThreadId: sent.threadId })
    .where(eq(applications.id, app.id));
  return { status: "submitted", confirmation: sent.messageId, via: "email", message };
}

async function applyInBrowser(ctx: WorkerContext, s: AgentSubject, offer: OfferRow): Promise<ApplyResult> {
  const connector = ctx.connectors.get(offer.source);
  if (!connector) return { status: "failed", reason: `Source ${offer.source} désactivée`, retryable: false };
  if (ctx.config.DISCOVERY_MODE === "http") {
    // Browserless mode: the agent never drives a browser, so site forms are filled by the user.
    return {
      status: "needs_user_action",
      reason: `Postulez directement sur ${connector.displayName} via le lien de l'offre (envoi automatique par formulaire désactivé)`,
    };
  }
  const provider = offer.source as Exclude<OfferRow["source"], "email">;
  const integration = await ctx.secrets.load(s.user.id, provider);
  if (!integration) return { status: "needs_user_action", reason: `Connectez votre compte ${connector.displayName}` };

  const coverLetter = (await ctx.ai.writer.writeEmail(s.cv.profile, offer)).body;

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
