import { and, cvs, eq, users, type Database } from "@jobia/db";
import type { QUEUES, TypedQueue } from "@jobia/queue";
import { JobPreferencesSchema, PUBLIC_SEARCH_SOURCES, type AgentSearchStatusDto } from "@jobia/shared";
import type { Redis } from "ioredis";
import { BadRequest, NotFound } from "../../http/errors";

/** A search stuck longer than this (crashed worker…) can be restarted. */
const STALE_AFTER_MS = 15 * 60_000;
const PROGRESS_TTL_S = 7 * 86_400;

/**
 * "Start my job search" from the dashboard: fans out one background
 * discovery job per public job board. Workers report progress in the
 * `agent:search:<userId>` Redis hash; the user only ever sees counts.
 */
export class AgentService {
  constructor(
    private readonly db: Database,
    private readonly redis: Redis,
    private readonly discoveryQueue: TypedQueue<typeof QUEUES.discovery>,
  ) {}

  private key(userId: string): string {
    return `agent:search:${userId}`;
  }

  async status(userId: string): Promise<AgentSearchStatusDto> {
    const h = await this.redis.hgetall(this.key(userId));
    if (!h.status) return { status: "idle", startedAt: null, finishedAt: null, offersFound: 0 };
    return {
      status: h.status === "done" ? "done" : "running",
      startedAt: h.startedAt ?? null,
      finishedAt: h.finishedAt || null,
      offersFound: Number(h.offersFound ?? 0),
    };
  }

  async startSearch(userId: string): Promise<AgentSearchStatusDto> {
    const current = await this.status(userId);
    const isFresh = current.startedAt && Date.now() - Date.parse(current.startedAt) < STALE_AFTER_MS;
    if (current.status === "running" && isFresh) return current; // already searching: no duplicate jobs

    const [row] = await this.db
      .select({ preferences: users.preferences, agentMode: users.agentMode, cvId: cvs.id })
      .from(users)
      .leftJoin(cvs, and(eq(cvs.userId, users.id), eq(cvs.isActive, true), eq(cvs.status, "ready")))
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw NotFound("User");
    if (!row.cvId) throw BadRequest("Ajoutez d'abord votre CV : la recherche se base sur votre profil.");
    if (row.agentMode === "paused") throw BadRequest("Votre agent est en pause : choisissez « Validation » pour lancer la recherche.");

    const preferences = JobPreferencesSchema.parse({ ...(row.preferences ?? {}), agentMode: row.agentMode });
    const sources = PUBLIC_SEARCH_SOURCES.filter((s) => preferences.enabledSources.includes(s));
    if (sources.length === 0) throw BadRequest("Aucun site d'emploi activé dans vos préférences.");

    const startedAt = new Date().toISOString();
    const key = this.key(userId);
    await this.redis
      .multi()
      .del(key)
      .hset(key, { status: "running", startedAt, finishedAt: "", offersFound: 0, pendingSources: sources.length })
      .expire(key, PROGRESS_TTL_S)
      .exec();

    const runId = Date.now();
    await this.discoveryQueue.addBulk(
      sources.map((source) => ({
        name: "discovery",
        data: { userId, source },
        opts: { jobId: `search-${userId}-${source}-${runId}` },
      })),
    );
    return { status: "running", startedAt, finishedAt: null, offersFound: 0 };
  }
}
