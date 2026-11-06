import { and, count, eq, gte } from "drizzle-orm";
import type { Database } from "./client";
import { applications } from "./schema";

/** Start of the current UTC day (plan limits reset at 00:00 UTC). */
export function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Today's plan usage, computed from the applications table (the source of
 * truth): offers the agent retained for the user, and applications sent.
 */
export async function dailyUsage(db: Database, userId: string): Promise<{ matchesToday: number; applicationsToday: number }> {
  const since = startOfUtcDay();
  const [[matches], [sent]] = await Promise.all([
    db.select({ n: count() }).from(applications).where(and(eq(applications.userId, userId), gte(applications.createdAt, since))),
    db.select({ n: count() }).from(applications).where(and(eq(applications.userId, userId), gte(applications.submittedAt, since))),
  ]);
  return { matchesToday: matches?.n ?? 0, applicationsToday: sent?.n ?? 0 };
}
