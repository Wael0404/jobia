import { and, asc, gt, inArray, integrations, isNull, lt, ne, or, users } from "@jobia/db";
import { jobId } from "@jobia/queue";
import { JobPreferencesSchema, type JobSourceId } from "@jobia/shared";
import type { WorkerContext } from "../context";

export const SCHEDULER_EVERY_MS = 15 * 60_000;
const PAGE_SIZE = 1_000;

/**
 * Periodic fan-out (runs on ONE worker thanks to BullMQ's job scheduler).
 * Walks active users with keyset pagination and enqueues, with windowed
 * deterministic job ids (no duplicates if a tick overlaps the next):
 *   - discovery for each connected board, when the user is due
 *   - Gmail inbox sync for every active user
 */
export async function processSchedulerTick(ctx: WorkerContext): Promise<void> {
  const window = Math.floor(Date.now() / SCHEDULER_EVERY_MS);
  const dueBefore = new Date(Date.now() - ctx.config.AGENT_DISCOVERY_INTERVAL_MINUTES * 60_000);
  let cursor = "00000000-0000-0000-0000-000000000000";

  for (;;) {
    const page = await ctx.db
      .select({ id: users.id, preferences: users.preferences, agentMode: users.agentMode, lastDiscoveryAt: users.lastDiscoveryAt })
      .from(users)
      .where(and(ne(users.agentMode, "paused"), gt(users.id, cursor)))
      .orderBy(asc(users.id))
      .limit(PAGE_SIZE);
    if (page.length === 0) break;
    cursor = page.at(-1)!.id;

    const due = page.filter((u) => !u.lastDiscoveryAt || u.lastDiscoveryAt < dueBefore);
    const boards = due.length
      ? await ctx.db
          .select({ userId: integrations.userId, provider: integrations.provider })
          .from(integrations)
          .where(
            and(
              inArray(integrations.userId, due.map((u) => u.id)),
              ne(integrations.provider, "google"),
              or(isNull(integrations.lastError), lt(integrations.updatedAt, dueBefore)),
              inArray(integrations.status, ["connected"]),
            ),
          )
      : [];

    const enabled = new Map(
      due.map((u) => [u.id, new Set(JobPreferencesSchema.parse({ ...(u.preferences ?? {}), agentMode: u.agentMode }).enabledSources)]),
    );
    await ctx.queues.discovery.addBulk(
      boards
        .filter((b) => enabled.get(b.userId)?.has(b.provider as JobSourceId))
        .map((b) => {
          const data = { userId: b.userId, source: b.provider as JobSourceId };
          return { name: "discovery", data, opts: { jobId: jobId.discovery(data, window) } };
        }),
    );
    await ctx.queues.inboxSync.addBulk(
      page.map((u) => {
        const data = { userId: u.id };
        return { name: "inbox.sync", data, opts: { jobId: jobId.inboxSync(data, window) } };
      }),
    );
  }
}
