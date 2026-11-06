import { PublicBoardSearcher, type DiscoveredOffer, type SearchQuery } from "@jobia/connectors";
import { jobOffers, sql, users, eq } from "@jobia/db";
import type { JobPayloads } from "@jobia/queue";
import type { JobSourceId } from "@jobia/shared";
import type { WorkerContext } from "../context";
import { loadSubject, type AgentSubject } from "./common";

/**
 * Finds offers on one job board for one user, stores them globally, then
 * hands the new offer ids to the matcher. Two modes (DISCOVERY_MODE):
 *  - "browser": logs into the board as the user (Playwright, encrypted session);
 *  - "http": reads the board's public search pages, no login, no browser.
 */
export async function processDiscovery(ctx: WorkerContext, payload: JobPayloads["discovery"]): Promise<void> {
  if (ctx.config.DISCOVERY_MODE !== "http") return discoverInBrowser(ctx, payload);
  try {
    const subject = await loadRunnableSubject(ctx, payload);
    if (subject) await discoverOverHttp(ctx, payload.userId, payload.source, buildQuery(subject));
  } finally {
    // Always report the source as finished, so the dashboard never stays stuck on "running".
    await searchProgress.sourceDone(ctx, payload.userId);
  }
}

async function loadRunnableSubject(ctx: WorkerContext, { userId, source }: JobPayloads["discovery"]) {
  const subject = await loadSubject(ctx, userId);
  if (!subject || subject.preferences.agentMode === "paused") return null;
  if (!subject.preferences.enabledSources.includes(source)) return null;
  return subject;
}

async function discoverInBrowser(ctx: WorkerContext, { userId, source }: JobPayloads["discovery"]): Promise<void> {
  const connector = ctx.connectors.get(source);
  if (!connector) return;
  const subject = await loadRunnableSubject(ctx, { userId, source });
  if (!subject) return;

  const integration = await ctx.secrets.load(userId, source as Exclude<typeof source, "email">);
  if (!integration) return; // board not connected by this user
  const credentials = JSON.parse(integration.secret) as { login: string; password: string };

  const query = buildQuery(subject);

  const offers = await ctx.browsers.withSession(integration.session, async (session) => {
    const page = await session.context.newPage();
    const connectorCtx = { page, credentials, logger: wrapLogger(ctx, userId, source) };

    const login = await connector.login(connectorCtx);
    if (login.status !== "ok") {
      const reason = login.status === "challenge" ? login.reason : "Identifiants refusés";
      await ctx.secrets.markNeedsReauth(userId, source as never, reason);
      ctx.logger.warn({ userId, source, status: login.status }, "login failed");
      return null;
    }
    const found = await connector.search(connectorCtx, query);
    await ctx.secrets.saveSession(userId, source as never, await session.exportState());
    return found;
  });
  if (!offers || offers.length === 0) return;

  const ids = await upsertOffers(ctx, offers);
  await ctx.db.update(users).set({ lastDiscoveryAt: new Date() }).where(eq(users.id, userId));
  await ctx.queues.match.add("match", { userId, jobOfferIds: ids });
  ctx.logger.info({ userId, source, found: offers.length }, "discovery done");
}

function buildQuery(subject: AgentSubject): SearchQuery {
  return {
    keywords: [...new Set([...subject.preferences.targetRoles, ...subject.cv.profile.searchKeywords])].slice(0, 6),
    location: subject.preferences.cities[0] ?? null,
    countryCode: subject.preferences.countries[0] ?? "TN",
    remoteOk: subject.preferences.remoteOk,
    postedWithinDays: 7,
    limit: 40,
  };
}

/** Browserless discovery: public search pages over HTTP, no account needed. */
async function discoverOverHttp(ctx: WorkerContext, userId: string, source: JobSourceId, query: SearchQuery): Promise<void> {
  if (!PublicBoardSearcher.supports(source)) return;
  const offers = await new PublicBoardSearcher(wrapLogger(ctx, userId, source)).search(source, query);
  await searchProgress.offersFound(ctx, userId, offers.length);
  if (offers.length === 0) return;

  const ids = await upsertOffers(ctx, offers);
  await ctx.db.update(users).set({ lastDiscoveryAt: new Date() }).where(eq(users.id, userId));
  await ctx.queues.match.add("match", { userId, jobOfferIds: ids });
  ctx.logger.info({ userId, source, found: offers.length }, "discovery done (http)");
}

/**
 * Per-user progress of a search started from the dashboard, kept in Redis
 * (`agent:search:<userId>`). The API initialises it; each discovery job
 * reports its source as done. Only counts are exposed to the user.
 */
const searchProgress = {
  key: (userId: string) => `agent:search:${userId}`,
  async offersFound(ctx: WorkerContext, userId: string, count: number) {
    if (await ctx.redis.exists(this.key(userId))) await ctx.redis.hincrby(this.key(userId), "offersFound", count);
  },
  async sourceDone(ctx: WorkerContext, userId: string) {
    const key = this.key(userId);
    if (!(await ctx.redis.exists(key))) return;
    const pending = await ctx.redis.hincrby(key, "pendingSources", -1);
    if (pending <= 0) await ctx.redis.hset(key, { status: "done", finishedAt: new Date().toISOString() });
  },
};

async function upsertOffers(ctx: WorkerContext, offers: DiscoveredOffer[]): Promise<string[]> {
  const rows = await ctx.db
    .insert(jobOffers)
    .values(offers.map((o) => ({ ...o, raw: null })))
    .onConflictDoUpdate({
      target: [jobOffers.source, jobOffers.externalId],
      set: {
        title: sql`excluded.title`,
        description: sql`excluded.description`,
        applyEmail: sql`coalesce(excluded.apply_email, ${jobOffers.applyEmail})`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: jobOffers.id });
  return rows.map((r) => r.id);
}

function wrapLogger(ctx: WorkerContext, userId: string, source: string) {
  const child = ctx.logger.child({ userId, source });
  return {
    info: (msg: string, data?: Record<string, unknown>) => child.info(data ?? {}, msg),
    warn: (msg: string, data?: Record<string, unknown>) => child.warn(data ?? {}, msg),
  };
}
