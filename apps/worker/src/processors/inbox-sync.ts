import type { EmailClassification, InboundEmail, OpenApplicationRef } from "@jobia/ai";
import { and, applicationEvents, applications, eq, inArray, interviews, jobOffers, transitionApplication, users } from "@jobia/db";
import type { JobPayloads } from "@jobia/queue";
import type { ApplicationStatus } from "@jobia/shared";
import type { WorkerContext } from "../context";
import { GmailAuthError, type GmailMailbox } from "../infra/gmail";

const STATUS_BY_KIND: Partial<Record<EmailClassification["kind"], ApplicationStatus>> = {
  interview_invitation: "interview",
  rejection: "rejected",
  offer: "offer",
  application_viewed: "viewed",
};

const RECRUITMENT_HINTS = /candidature|application|entretien|interview|recrutement|poste|position|offre|offer|ترشح|مقابلة/i;
const MAX_MESSAGES_PER_RUN = 100;

/**
 * Reads new INBOX messages since the last cursor and updates the matching
 * applications (interview → calendar, rejection, offer…). Idempotent:
 * each Gmail message id is applied at most once (dedupe key).
 */
export async function processInboxSync(ctx: WorkerContext, { userId }: JobPayloads["inbox.sync"]): Promise<void> {
  const [user] = await ctx.db.select({ historyId: users.gmailHistoryId, email: users.email }).from(users).where(eq(users.id, userId));
  if (!user) return;
  const mailbox = await ctx.secrets.gmail(userId);
  if (!mailbox) return;

  try {
    if (!user.historyId) return saveCursor(ctx, userId, await mailbox.currentHistoryId());
    const delta = await mailbox.newInboxMessageIds(user.historyId);
    if (!delta) return saveCursor(ctx, userId, await mailbox.currentHistoryId()); // cursor expired

    const open = await openApplications(ctx, userId);
    if (open.refs.length > 0) {
      for (const id of delta.ids.slice(0, MAX_MESSAGES_PER_RUN)) {
        await handleMessage(ctx, userId, user.email, mailbox, id, open);
      }
    }
    await saveCursor(ctx, userId, delta.historyId);
  } catch (error) {
    if (error instanceof GmailAuthError) return ctx.secrets.markNeedsReauth(userId, "google", error.message);
    throw error;
  }
}

async function handleMessage(
  ctx: WorkerContext,
  userId: string,
  ownEmail: string,
  mailbox: GmailMailbox,
  messageId: string,
  open: { refs: OpenApplicationRef[]; byThread: Map<string, string> },
): Promise<void> {
  const email: InboundEmail = await mailbox.read(messageId);
  if (email.from.toLowerCase().includes(ownEmail.toLowerCase())) return;

  // Cheap pre-filter before paying for an LLM call.
  const threadMatch = open.byThread.get(email.threadId);
  const companyMatch = open.refs.some((r) => `${email.from} ${email.subject} ${email.text}`.toLowerCase().includes(r.company.toLowerCase()));
  if (!threadMatch && !companyMatch && !RECRUITMENT_HINTS.test(`${email.subject} ${email.text.slice(0, 2_000)}`)) return;

  const result = await ctx.ai.inbox.classify(email, open.refs);
  const applicationId = threadMatch ?? result.applicationId;
  if (!result.isRecruitmentRelated || !applicationId || !open.refs.some((r) => r.applicationId === applicationId)) return;

  const to = STATUS_BY_KIND[result.kind];
  const event = {
    applicationId,
    userId,
    actor: "employer" as const,
    message: result.summary,
    payload: { kind: result.kind, subject: email.subject, from: email.from },
    dedupeKey: `gmail:${userId}:${messageId}`,
  };
  if (to) {
    await transitionApplication(ctx.db, { ...event, to });
  } else {
    // Informational email (request for documents…): timeline entry only, status unchanged.
    await ctx.db.insert(applicationEvents).values(event).onConflictDoNothing({ target: applicationEvents.dedupeKey });
  }

  if (result.kind === "interview_invitation" && result.interview) {
    const scheduledAt = new Date(result.interview.scheduledAt);
    if (!Number.isNaN(scheduledAt.getTime())) {
      await ctx.db
        .insert(interviews)
        .values({
          applicationId,
          userId,
          scheduledAt,
          location: result.interview.location,
          meetingUrl: result.interview.meetingUrl,
          notes: result.summary,
          sourceMessageId: messageId,
        })
        .onConflictDoNothing({ target: interviews.sourceMessageId });
    }
  }
}

async function openApplications(ctx: WorkerContext, userId: string) {
  const rows = await ctx.db
    .select({ id: applications.id, threadId: applications.emailThreadId, company: jobOffers.company, title: jobOffers.title })
    .from(applications)
    .innerJoin(jobOffers, eq(jobOffers.id, applications.jobOfferId))
    .where(and(eq(applications.userId, userId), inArray(applications.status, ["submitted", "viewed", "interview"])))
    .limit(300);
  return {
    refs: rows.map((r) => ({ applicationId: r.id, company: r.company, title: r.title })),
    byThread: new Map(rows.filter((r) => r.threadId).map((r) => [r.threadId as string, r.id])),
  };
}

async function saveCursor(ctx: WorkerContext, userId: string, historyId: string): Promise<void> {
  await ctx.db.update(users).set({ gmailHistoryId: historyId }).where(eq(users.id, userId));
}
