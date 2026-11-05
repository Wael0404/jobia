import { and, applications, eq, gte, interviews, jobOffers, sql, type Database } from "@jobia/db";
import { APPLICATION_STATUSES, type ApplicationStatus, type ReportSummaryDto } from "@jobia/shared";
import type { Redis } from "ioredis";

const CACHE_TTL_S = 60;

/**
 * The dashboard is the most-read screen. Aggregates are cached per user in
 * Redis for 60 s, so 100k users refreshing their dashboard cost at most
 * ~1.7k aggregate queries per second on the read replica.
 */
export class ReportsService {
  constructor(
    private readonly db: Database,
    private readonly redis: Redis,
  ) {}

  async summary(userId: string): Promise<ReportSummaryDto> {
    const key = `report:summary:${userId}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as ReportSummaryDto;

    const report = await this.compute(userId);
    await this.redis.set(key, JSON.stringify(report), "EX", CACHE_TTL_S);
    return report;
  }

  private async compute(userId: string): Promise<ReportSummaryDto> {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [byStatus, bySource, perDay, upcoming] = await Promise.all([
      this.db
        .select({ status: applications.status, count: sql<number>`count(*)::int` })
        .from(applications)
        .where(eq(applications.userId, userId))
        .groupBy(applications.status),
      this.db
        .select({ source: jobOffers.source, count: sql<number>`count(*)::int` })
        .from(applications)
        .innerJoin(jobOffers, eq(jobOffers.id, applications.jobOfferId))
        .where(eq(applications.userId, userId))
        .groupBy(jobOffers.source),
      this.db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${applications.submittedAt}), 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
        })
        .from(applications)
        .where(and(eq(applications.userId, userId), gte(applications.submittedAt, since)))
        .groupBy(sql`1`)
        .orderBy(sql`1`),
      this.db
        .select({
          applicationId: interviews.applicationId,
          scheduledAt: interviews.scheduledAt,
          location: interviews.location,
          company: jobOffers.company,
          title: jobOffers.title,
        })
        .from(interviews)
        .innerJoin(applications, eq(applications.id, interviews.applicationId))
        .innerJoin(jobOffers, eq(jobOffers.id, applications.jobOfferId))
        .where(and(eq(interviews.userId, userId), gte(interviews.scheduledAt, new Date())))
        .orderBy(interviews.scheduledAt)
        .limit(10),
    ]);

    const totals = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
    for (const row of byStatus) totals[row.status] = row.count;

    return {
      totals,
      bySource,
      appliedLast7Days: perDay,
      upcomingInterviews: upcoming.map((i) => ({ ...i, scheduledAt: i.scheduledAt.toISOString() })),
    };
  }
}
