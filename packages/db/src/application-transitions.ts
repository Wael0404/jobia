import { APPLICATION_STATUSES, canTransition, type ApplicationStatus } from "@jobia/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./client";
import { applicationEvents, applications } from "./schema";

export interface TransitionInput {
  applicationId: string;
  userId: string;
  to: ApplicationStatus;
  actor: "agent" | "user" | "employer" | "system";
  message: string;
  payload?: Record<string, unknown>;
  /** Idempotency key: the same external event (e.g. a Gmail message) is applied once. */
  dedupeKey?: string;
  patch?: Partial<Pick<typeof applications.$inferInsert, "submittedAt" | "lastError" | "pendingQuestions" | "coverLetter" | "emailThreadId" | "appliedVia">>;
}

export type TransitionResult = { applied: true; from: ApplicationStatus } | { applied: false; reason: "not_allowed" | "duplicate" };

/**
 * The single way to change an application's status, used by both the API
 * and the workers. The UPDATE is guarded by the set of statuses allowed to
 * reach `to`, so concurrent writers can never break the state machine
 * (compare-and-set, no SELECT … FOR UPDATE needed).
 */
export async function transitionApplication(db: Database, input: TransitionInput): Promise<TransitionResult> {
  const allowedFrom = APPLICATION_STATUSES.filter((from) => canTransition(from, input.to));
  if (allowedFrom.length === 0) return { applied: false, reason: "not_allowed" };

  return db.transaction(async (tx) => {
    if (input.dedupeKey) {
      const inserted = await tx
        .insert(applicationEvents)
        .values({
          applicationId: input.applicationId,
          userId: input.userId,
          actor: input.actor,
          message: input.message,
          payload: input.payload,
          dedupeKey: input.dedupeKey,
        })
        .onConflictDoNothing({ target: applicationEvents.dedupeKey })
        .returning({ id: applicationEvents.id });
      if (inserted.length === 0) return { applied: false, reason: "duplicate" } as const;
    }

    const [previous] = await tx
      .select({ status: applications.status })
      .from(applications)
      .where(and(eq(applications.id, input.applicationId), eq(applications.userId, input.userId)))
      .limit(1);

    const [updated] = await tx
      .update(applications)
      .set({ ...input.patch, status: input.to, updatedAt: sql`now()` })
      .where(
        and(
          eq(applications.id, input.applicationId),
          eq(applications.userId, input.userId),
          inArray(applications.status, allowedFrom),
        ),
      )
      .returning({ id: applications.id });

    if (!updated || !previous) {
      // With a dedupe key the event stays in the timeline as information
      // (e.g. a second reminder email) — the status simply does not move.
      return { applied: false, reason: "not_allowed" } as const;
    }

    const event = {
      applicationId: input.applicationId,
      userId: input.userId,
      actor: input.actor,
      fromStatus: previous.status,
      toStatus: input.to,
      message: input.message,
      payload: input.payload,
    };
    if (input.dedupeKey) {
      await tx
        .update(applicationEvents)
        .set({ fromStatus: previous.status, toStatus: input.to })
        .where(eq(applicationEvents.dedupeKey, input.dedupeKey));
    } else {
      await tx.insert(applicationEvents).values(event);
    }
    return { applied: true, from: previous.status } as const;
  });
}
