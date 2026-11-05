import { and, cvs, eq, users } from "@jobia/db";
import { JobPreferencesSchema, type CandidateProfile, type JobPreferences } from "@jobia/shared";
import { UnrecoverableError } from "bullmq";
import type { WorkerContext } from "../context";

export interface AgentSubject {
  user: typeof users.$inferSelect;
  preferences: JobPreferences;
  cv: typeof cvs.$inferSelect & { profile: CandidateProfile };
}

/** Loads the user, their preferences and their active, parsed CV. Returns null if the agent cannot run yet. */
export async function loadSubject(ctx: WorkerContext, userId: string): Promise<AgentSubject | null> {
  const [row] = await ctx.db
    .select({ user: users, cv: cvs })
    .from(users)
    .innerJoin(cvs, and(eq(cvs.userId, users.id), eq(cvs.isActive, true), eq(cvs.status, "ready")))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row?.cv.profile) return null;
  const preferences = JobPreferencesSchema.parse({ ...(row.user.preferences ?? {}), agentMode: row.user.agentMode });
  return { user: row.user, preferences, cv: { ...row.cv, profile: row.cv.profile } };
}

/** Marks an error as permanent so BullMQ does not waste retries on it. */
export function permanent(message: string): never {
  throw new UnrecoverableError(message);
}
