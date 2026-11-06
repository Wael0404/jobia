/**
 * LinkedIn Easy Apply flow against a real Postgres (LLM, web and Gmail stubbed).
 * Run with: INTEGRATION=1 DATABASE_URL=… pnpm --filter @jobia/worker test
 */
import type { ContactReport } from "@jobia/ai";
import { applications, createDatabase, cvs, eq, jobOffers, offerContacts, users, type Database } from "@jobia/db";
import type { CandidateProfile } from "@jobia/shared";
import type { Job } from "bullmq";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { WorkerContext } from "../src/context";
import { processSubmit } from "../src/processors/submit";
import { OfferContactResolver } from "../src/services/offer-contacts";

const enabled = process.env.INTEGRATION === "1";

const profile: CandidateProfile = {
  fullName: "Test Candidate", headline: "Développeur", email: null, phone: null, location: "Tunis", summary: "",
  yearsOfExperience: 5, skills: ["React"], languages: [], experiences: [], education: [],
  targetRoles: ["Développeur"], searchKeywords: ["react"],
};

describe.skipIf(!enabled)("LinkedIn Easy Apply → recruiter email or one-click (integration)", () => {
  let db: Database;
  let close: () => Promise<void>;
  let userId: string;
  let cvId: string;

  // Stubs, reset before each test.
  let finderCalls = 0;
  let report: ContactReport;
  let page = "";
  let sent: Array<{ to: string; subject: string }> = [];
  let released = 0;

  beforeAll(async () => {
    ({ db, close } = createDatabase({ url: process.env.DATABASE_URL!, applicationName: "test" }));
    const [user] = await db
      .insert(users)
      .values({ googleSub: randomUUID(), email: `${randomUUID()}@test.tn`, name: "Test Candidate", agentMode: "autopilot" })
      .returning();
    userId = user!.id;
    const [cv] = await db
      .insert(cvs)
      .values({ userId, storageKey: "k", fileName: "cv.pdf", mimeType: "application/pdf", sizeBytes: 3, status: "ready", isActive: true, profile })
      .returning();
    cvId = cv!.id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(users).where(eq(users.id, userId));
    await close();
  });

  beforeEach(() => {
    finderCalls = 0;
    sent = [];
    released = 0;
    page = "";
    report = { email: null, sourceUrl: null, reason: "nothing" };
  });

  function resolver() {
    return new OfferContactResolver(
      db,
      { find: async () => (finderCalls++, report) },
      async () => page,
      { warn() {} },
    );
  }

  function ctx(): WorkerContext {
    return {
      db,
      logger: { info() {}, warn() {}, error() {} },
      quota: { tryConsume: async () => true, release: async () => void released++ },
      contacts: resolver(),
      ai: { writer: { writeEmail: async () => ({ language: "fr", subject: "Candidature", body: "Bonjour, ma lettre." }) } },
      secrets: {
        gmail: async () => ({
          send: async (m: { to: string; subject: string }) => (sent.push(m), { messageId: "m1", threadId: `t-${randomUUID()}` }),
        }),
        markNeedsReauth: async () => {},
      },
      files: { read: async () => Buffer.from("pdf") },
    } as unknown as WorkerContext;
  }

  const job = { attemptsMade: 0, opts: { attempts: 5 }, moveToDelayed: async () => {} } as unknown as Job;

  async function easyApplyOffer(description = "Nous recherchons un développeur React.") {
    const [offer] = await db
      .insert(jobOffers)
      .values({
        source: "linkedin",
        externalId: `job:${randomUUID()}`,
        url: "https://www.linkedin.com/jobs/view/1/",
        title: "Développeur React",
        company: "Acme",
        description,
        applyChannel: "easy_apply",
      })
      .returning();
    const [app] = await db
      .insert(applications)
      .values({ userId, jobOfferId: offer!.id, cvId, status: "queued", matchScore: 90 })
      .returning();
    return { offer: offer!, app: app! };
  }

  it("uses an email written in the offer itself, without web research", async () => {
    const { app } = await easyApplyOffer("Envoyez votre CV à recrutement@acme.tn");
    await processSubmit(ctx(), { userId, applicationId: app.id }, job);

    const [row] = await db.select().from(applications).where(eq(applications.id, app.id));
    expect(row).toMatchObject({ status: "submitted", appliedVia: "email" });
    expect(sent.map((m) => m.to)).toEqual(["recrutement@acme.tn"]);
    expect(finderCalls).toBe(0);
  });

  it("applies by email when the address is found AND verified on the company page", async () => {
    const { app } = await easyApplyOffer();
    report = { email: "rh@acme.tn", sourceUrl: "https://acme.tn/carrieres", reason: "careers page" };
    page = "<p>Envoyez vos candidatures à <a href='mailto:rh@acme.tn'>rh@acme.tn</a></p>";

    await processSubmit(ctx(), { userId, applicationId: app.id }, job);

    const [row] = await db.select().from(applications).where(eq(applications.id, app.id));
    expect(row).toMatchObject({ status: "submitted", appliedVia: "email" });
    expect(sent.map((m) => m.to)).toEqual(["rh@acme.tn"]);
  });

  it("rejects an address that is not on the cited page and lets the user apply in one click", async () => {
    const { app, offer } = await easyApplyOffer();
    report = { email: "jobs@acme.tn", sourceUrl: "https://acme.tn/contact", reason: "guess" };
    page = "<p>Contactez-nous au +216 71 000 000</p>"; // the AI-reported address is not there

    await processSubmit(ctx(), { userId, applicationId: app.id }, job);

    const [row] = await db.select().from(applications).where(eq(applications.id, app.id));
    expect(row).toMatchObject({ status: "user_to_apply", appliedVia: "easy_apply", coverLetter: "Bonjour, ma lettre." });
    expect(sent).toHaveLength(0);
    expect(released).toBe(1); // nothing was sent: the daily quota slot is given back

    const [cached] = await db.select().from(offerContacts).where(eq(offerContacts.jobOfferId, offer.id));
    expect(cached).toMatchObject({ email: null, foundVia: "none" });
  });

  it("researches each offer once, whatever the number of users", async () => {
    const { offer } = await easyApplyOffer();
    const r = resolver();
    await r.resolve(offer);
    await r.resolve(offer);
    expect(finderCalls).toBe(1);
  });
});
