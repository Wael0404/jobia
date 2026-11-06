import { JobMatcher, MATCH_BATCH_SIZE } from "@jobia/ai";
import { and, applications, eq, inArray, jobOffers } from "@jobia/db";
import { jobId, type JobPayloads } from "@jobia/queue";
import type { ApplicationStatus } from "@jobia/shared";
import type { WorkerContext } from "../context";
import { loadSubject } from "./common";

/**
 * Two-stage matching: a free keyword pre-filter removes most offers, then
 * the LLM scores the rest in batches. Applications above the user's
 * threshold are created as `queued` (autopilot) or `pending_review`.
 */
export async function processMatch(ctx: WorkerContext, { userId, jobOfferIds }: JobPayloads["match"]): Promise<void> {
  const subject = await loadSubject(ctx, userId);
  if (!subject || subject.preferences.agentMode === "paused" || jobOfferIds.length === 0) return;
  const { preferences, cv } = subject;

  const already = await ctx.db
    .select({ id: applications.jobOfferId })
    .from(applications)
    .where(and(eq(applications.userId, userId), inArray(applications.jobOfferId, jobOfferIds)));
  const skip = new Set(already.map((a) => a.id));

  const offers = (await ctx.db.select().from(jobOffers).where(inArray(jobOffers.id, jobOfferIds)))
    .filter((o) => !skip.has(o.id))
    .filter((o) => o.applyChannel !== "email" || o.applyEmail)
    .filter((o) => JobMatcher.prefilter(cv.profile, preferences, o));

  const status: ApplicationStatus = preferences.agentMode === "autopilot" ? "queued" : "pending_review";
  for (let i = 0; i < offers.length; i += MATCH_BATCH_SIZE) {
    const batch = offers.slice(i, i + MATCH_BATCH_SIZE);
    const results = await ctx.ai.matcher.score(cv.profile, batch);
    const selected = results.filter((r) => r.score >= preferences.minMatchScore && !r.dealBreaker);
    if (selected.length === 0) continue;

    const created = await ctx.db
      .insert(applications)
      .values(
        selected.map((r) => ({
          userId,
          jobOfferId: r.offerId,
          cvId: cv.id,
          status,
          matchScore: r.score,
          matchReasons: r.reasons,
        })),
      )
      .onConflictDoNothing({ target: [applications.userId, applications.jobOfferId] })
      .returning({ id: applications.id });

    if (status === "queued") {
      await ctx.queues.submit.addBulk(
        created.map(({ id }) => {
          const data = { userId, applicationId: id };
          return { name: "submit", data, opts: { jobId: jobId.submit(data) } };
        }),
      );
    }
  }
  // Refresh the dashboard's cached statistics right away.
  await ctx.redis.del(`report:summary:${userId}`);
  ctx.logger.info({ userId, candidates: offers.length }, "matching done");
}
