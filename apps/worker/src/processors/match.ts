import { JobMatcher, MATCH_BATCH_SIZE, type MatchResult } from "@jobia/ai";
import { and, applications, dailyUsage, eq, inArray, jobOffers } from "@jobia/db";
import { jobId, type JobPayloads } from "@jobia/queue";
import { PLANS, type ApplicationStatus } from "@jobia/shared";
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

  // Plan limit: offers the agent may retain per day (best scores first).
  const allowance = await reserveDailyMatches(ctx, userId, PLANS[subject.user.plan].dailyMatches);
  if (allowance.remaining <= 0) {
    ctx.logger.info({ userId, plan: subject.user.plan }, "daily match limit reached");
    return;
  }

  const scored: MatchResult[] = [];
  for (let i = 0; i < offers.length; i += MATCH_BATCH_SIZE) {
    const results = await ctx.ai.matcher.score(cv.profile, offers.slice(i, i + MATCH_BATCH_SIZE));
    scored.push(...results.filter((r) => r.score >= preferences.minMatchScore && !r.dealBreaker));
  }
  const selected = await allowance.take(scored.sort((a, b) => b.score - a.score));

  const status: ApplicationStatus = preferences.agentMode === "autopilot" ? "queued" : "pending_review";
  if (selected.length > 0) {
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
    // Offers already proposed earlier do not count against today's allowance.
    await allowance.giveBack(selected.length - created.length);

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

/**
 * Atomic per-day counter of retained offers (Redis key shared with the
 * API usage display). take() reserves up to the remaining allowance, so two
 * concurrent match jobs can never exceed the plan limit together.
 */
export async function reserveDailyMatches(ctx: WorkerContext, userId: string, limit: number | null) {
  const key = `matches:${new Date().toISOString().slice(0, 10)}:${userId}`;
  // The database is the source of truth: seed the atomic counter from today's
  // applications when it does not exist yet (first run of the day, Redis restart).
  if (!(await ctx.redis.exists(key))) {
    const { matchesToday } = await dailyUsage(ctx.db, userId);
    await ctx.redis.set(key, matchesToday, "EX", 2 * 86_400, "NX");
  }
  const used = Number((await ctx.redis.get(key)) ?? 0);
  return {
    remaining: limit === null ? Number.POSITIVE_INFINITY : limit - used,
    async take<T>(items: T[]): Promise<T[]> {
      if (items.length === 0) return items;
      const after = await ctx.redis.incrby(key, items.length);
      await ctx.redis.expire(key, 2 * 86_400);
      if (limit === null || after <= limit) return items;
      const allowed = Math.max(0, items.length - (after - limit));
      await ctx.redis.decrby(key, items.length - allowed);
      return items.slice(0, allowed);
    },
    async giveBack(count: number): Promise<void> {
      if (count > 0) await ctx.redis.decrby(key, count);
    },
  };
}
