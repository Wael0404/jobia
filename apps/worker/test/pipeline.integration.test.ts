/**
 * Agent pipeline against a real Postgres, with the LLM and Gmail stubbed.
 * Run with: INTEGRATION=1 DATABASE_URL=… pnpm --filter @jobia/worker test
 */
import type { EmailClassification, MatchResult } from "@jobia/ai";
import { JobMatcher } from "@jobia/ai";
import { applicationEvents, applications, createDatabase, cvs, eq, interviews, jobOffers, users, type Database } from "@jobia/db";
import type { CandidateProfile } from "@jobia/shared";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WorkerContext } from "../src/context";
import { processInboxSync } from "../src/processors/inbox-sync";
import { processMatch } from "../src/processors/match";

const enabled = process.env.INTEGRATION === "1";

const profile: CandidateProfile = {
  fullName: "Test Candidate",
  headline: "Développeur Full-Stack",
  email: null,
  phone: null,
  location: "Tunis",
  summary: "",
  yearsOfExperience: 6,
  skills: ["React", "Node.js"],
  languages: [],
  experiences: [],
  education: [],
  targetRoles: ["Développeur Full-Stack"],
  searchKeywords: ["react", "node.js"],
};

describe.skipIf(!enabled)("agent pipeline (integration)", () => {
  let db: Database;
  let close: () => Promise<void>;
  let userId: string;
  const offerIds: Record<string, string> = {};
  const enqueued: unknown[] = [];

  beforeAll(async () => {
    ({ db, close } = createDatabase({ url: process.env.DATABASE_URL!, applicationName: "test" }));
    const [user] = await db
      .insert(users)
      .values({ googleSub: randomUUID(), email: `${randomUUID()}@test.tn`, name: "T", agentMode: "autopilot", gmailHistoryId: "1" })
      .returning();
    userId = user!.id;
    await db.insert(cvs).values({ userId, storageKey: "k", fileName: "cv.pdf", mimeType: "application/pdf", sizeBytes: 1, status: "ready", isActive: true, profile });

    for (const [key, title, company] of [
      ["strong", "Développeur React Senior", "Acme"],
      ["weak", "Développeur React Junior", "Beta"],
      ["blocked", "Lead Node.js (nationalité FR exigée)", "Gamma"],
      ["irrelevant", "Comptable", "Delta"],
    ] as const) {
      const [o] = await db
        .insert(jobOffers)
        .values({ source: "tanitjobs", externalId: randomUUID(), url: `https://x.tn/${key}`, title, company, applyChannel: "site_form" })
        .returning();
      offerIds[key] = o!.id;
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(users).where(eq(users.id, userId));
    await close();
  });

  function ctx(overrides: Partial<WorkerContext["ai"]>, gmail: unknown = null): WorkerContext {
    const scores: Record<string, Omit<MatchResult, "offerId">> = {
      [offerIds.strong!]: { score: 91, reasons: ["React 6 ans"], dealBreaker: null },
      [offerIds.weak!]: { score: 55, reasons: ["Trop junior"], dealBreaker: null },
      [offerIds.blocked!]: { score: 88, reasons: ["Node"], dealBreaker: "Nationalité exigée" },
    };
    return {
      db,
      logger: { info() {}, warn() {}, error() {} },
      ai: {
        matcher: {
          score: async (_p: CandidateProfile, offers: Array<{ id: string }>) => offers.map((o) => ({ offerId: o.id, ...scores[o.id]! })),
        } as unknown as JobMatcher,
        ...overrides,
      },
      queues: { submit: { addBulk: async (jobs: unknown[]) => void enqueued.push(...jobs) } },
      secrets: { gmail: async () => gmail, markNeedsReauth: async () => {} },
    } as unknown as WorkerContext;
  }

  it("creates queued applications only for strong, unblocked, relevant matches", async () => {
    await processMatch(ctx({}), { userId, jobOfferIds: Object.values(offerIds) });

    const rows = await db.select().from(applications).where(eq(applications.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jobOfferId: offerIds.strong, status: "queued", matchScore: 91 });
    expect(enqueued).toHaveLength(1);
  });

  it("is idempotent when the same offers are matched again", async () => {
    await processMatch(ctx({}), { userId, jobOfferIds: Object.values(offerIds) });
    expect(await db.select().from(applications).where(eq(applications.userId, userId))).toHaveLength(1);
  });

  it("turns an interview email into an interview, exactly once", async () => {
    const [app] = await db.select().from(applications).where(eq(applications.userId, userId));
    await db.update(applications).set({ status: "submitted", emailThreadId: "thread-1" }).where(eq(applications.id, app!.id));

    const mailbox = {
      newInboxMessageIds: async () => ({ ids: ["msg-1"], historyId: "2" }),
      currentHistoryId: async () => "2",
      read: async () => ({
        messageId: "msg-1",
        threadId: "thread-1",
        from: "rh@acme.tn",
        subject: "Votre candidature",
        receivedAt: new Date().toISOString(),
        text: "Nous souhaitons vous rencontrer mardi à 10h.",
      }),
    };
    const classification: EmailClassification = {
      isRecruitmentRelated: true,
      applicationId: app!.id,
      kind: "interview_invitation",
      interview: { scheduledAt: "2030-01-15T10:00:00+01:00", location: "Tunis", meetingUrl: null },
      summary: "Acme vous invite à un entretien le 15 janvier",
    };
    const c = ctx({ inbox: { classify: async () => classification } as never }, mailbox);

    await processInboxSync(c, { userId });
    await db.update(users).set({ gmailHistoryId: "1" }).where(eq(users.id, userId)); // simulate a replay
    await processInboxSync(c, { userId });

    const [updated] = await db.select().from(applications).where(eq(applications.id, app!.id));
    expect(updated!.status).toBe("interview");
    expect(await db.select().from(interviews).where(eq(interviews.applicationId, app!.id))).toHaveLength(1);
    const events = await db.select().from(applicationEvents).where(eq(applicationEvents.applicationId, app!.id));
    expect(events.filter((e) => e.toStatus === "interview")).toHaveLength(1);
  });
});
