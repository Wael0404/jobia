import type { DiscoveredOffer, SearchQuery } from "@jobia/connectors";
import { jobOffers, sql, users, eq } from "@jobia/db";
import type { JobPayloads } from "@jobia/queue";
import type { WorkerContext } from "../context";
import { loadSubject } from "./common";

/**
 * Logs into one job board as the user (reusing the encrypted session when
 * possible), runs searches built from the CV, stores the offers globally,
 * then hands the new offer ids to the matcher.
 */
export async function processDiscovery(ctx: WorkerContext, { userId, source }: JobPayloads["discovery"]): Promise<void> {
  const connector = ctx.connectors.get(source);
  if (!connector) return;

  const subject = await loadSubject(ctx, userId);
  if (!subject || subject.preferences.agentMode === "paused") return;
  if (!subject.preferences.enabledSources.includes(source)) return;

  const integration = await ctx.secrets.load(userId, source as Exclude<typeof source, "email">);
  if (!integration) return; // board not connected by this user
  const credentials = JSON.parse(integration.secret) as { login: string; password: string };

  const query: SearchQuery = {
    keywords: [...new Set([...subject.preferences.targetRoles, ...subject.cv.profile.searchKeywords])].slice(0, 6),
    location: subject.preferences.cities[0] ?? null,
    countryCode: subject.preferences.countries[0] ?? "TN",
    remoteOk: subject.preferences.remoteOk,
    postedWithinDays: 7,
    limit: 40,
  };

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
