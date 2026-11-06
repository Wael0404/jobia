/**
 * End-to-end HTTP tests against a real Postgres + Redis.
 * Run with: INTEGRATION=1 DATABASE_URL=… REDIS_URL=… pnpm --filter @jobia/api test
 */
import { applications, cvs, eq, jobOffers, refreshTokens, users } from "@jobia/db";
import { generateOpaqueToken, hashToken } from "@jobia/security";
import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { createContainer, type Container } from "../src/container";

const enabled = process.env.INTEGRATION === "1";

describe.skipIf(!enabled)("API (integration)", () => {
  let container: Container;
  let app: FastifyInstance;
  let token: string;
  let userId: string;
  let applicationId: string;

  beforeAll(async () => {
    const config = loadConfig({
      ...process.env,
      S3_REGION: "eu-west-3",
      S3_BUCKET: "test",
      JWT_ACCESS_SECRET: "x".repeat(40),
      GOOGLE_CLIENT_ID: "test",
      GOOGLE_CLIENT_SECRET: "test",
      PUBLIC_API_URL: "http://localhost:4000",
      WEB_ORIGIN: "http://localhost:3000",
      VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
      LOG_LEVEL: "warn",
    });
    container = createContainer(config);
    app = await buildApp(container);
    const { db } = container;

    const [user] = await db
      .insert(users)
      .values({ googleSub: randomUUID(), email: `${randomUUID()}@test.tn`, name: "Test User" })
      .returning();
    userId = user!.id;
    token = app.jwt.sign({ sub: userId, email: user!.email });

    const [cv] = await db
      .insert(cvs)
      .values({ userId, storageKey: "k", fileName: "cv.pdf", mimeType: "application/pdf", sizeBytes: 1, status: "ready", isActive: true })
      .returning();
    const [offer] = await db
      .insert(jobOffers)
      .values({
        source: "tanitjobs",
        externalId: randomUUID(),
        url: "https://example.tn/job/1",
        title: "Développeur Full-Stack",
        company: "Acme",
        applyChannel: "site_form",
      })
      .returning();
    const [application] = await db
      .insert(applications)
      .values({ userId, jobOfferId: offer!.id, cvId: cv!.id, status: "pending_review", matchScore: 88, matchReasons: ["React"] })
      .returning();
    applicationId = application!.id;
  });

  afterAll(async () => {
    if (!container) return;
    await container.db.delete(users).where(eq(users.id, userId));
    await container.queues.submit.obliterate({ force: true });
    await app.close();
    await container.close();
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  it("rejects unauthenticated requests", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me" });
    expect(res.statusCode).toBe(401);
  });

  it("returns the current user", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me", headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: userId, hasCv: true, agentMode: "review" });
  });

  it("validates and saves preferences", async () => {
    const bad = await app.inject({ method: "PUT", url: "/v1/me/preferences", headers: auth(), payload: { agentMode: "yolo" } });
    expect(bad.statusCode).toBe(400);

    const ok = await app.inject({
      method: "PUT",
      url: "/v1/me/preferences",
      headers: auth(),
      payload: { agentMode: "autopilot", countries: ["TN"], targetRoles: ["Développeur"] },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ agentMode: "autopilot", minMatchScore: 70 });
  });

  it("lists applications with their offer", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/applications?limit=10", headers: auth() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: applicationId, status: "pending_review", job: { company: "Acme" } });
  });

  it("approves a proposed application and enqueues the submission", async () => {
    const res = await app.inject({ method: "POST", url: `/v1/applications/${applicationId}/approve`, headers: auth() });
    expect(res.statusCode).toBe(202);
    expect(await container.queues.submit.count()).toBeGreaterThanOrEqual(1);

    const detail = await app.inject({ method: "GET", url: `/v1/applications/${applicationId}`, headers: auth() });
    expect(detail.json()).toMatchObject({ status: "queued" });
    expect(detail.json().events.at(-1)).toMatchObject({ fromStatus: "pending_review", toStatus: "queued", actor: "user" });
  });

  it("refuses an illegal transition (approve twice)", async () => {
    const res = await app.inject({ method: "POST", url: `/v1/applications/${applicationId}/approve`, headers: auth() });
    expect(res.statusCode).toBe(409);
  });

  it("lets the user confirm an Easy Apply application they sent themselves", async () => {
    const [cv] = await container.db.select().from(cvs).where(eq(cvs.userId, userId));
    const [offer] = await container.db
      .insert(jobOffers)
      .values({ source: "linkedin", externalId: randomUUID(), url: "https://www.linkedin.com/jobs/view/2/", title: "Dev", company: "Beta", applyChannel: "easy_apply" })
      .returning();
    const [manual] = await container.db
      .insert(applications)
      .values({ userId, jobOfferId: offer!.id, cvId: cv!.id, status: "user_to_apply", matchScore: 80, appliedVia: "easy_apply" })
      .returning();

    const listed = await app.inject({ method: "GET", url: "/v1/applications?status=user_to_apply", headers: auth() });
    expect(listed.json().items.map((a: { id: string }) => a.id)).toEqual([manual!.id]);

    const ok = await app.inject({ method: "POST", url: `/v1/applications/${manual!.id}/mark-applied`, headers: auth() });
    expect(ok.statusCode).toBe(202);
    const detail = await app.inject({ method: "GET", url: `/v1/applications/${manual!.id}`, headers: auth() });
    expect(detail.json()).toMatchObject({ status: "submitted", appliedVia: "easy_apply" });
    expect(detail.json().submittedAt).not.toBeNull();

    const again = await app.inject({ method: "POST", url: `/v1/applications/${manual!.id}/mark-applied`, headers: auth() });
    expect(again.statusCode).toBe(409);
  });

  it("serves the report summary", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/reports/summary", headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().totals.queued).toBe(1);
  });

  it("does not leak another user's application", async () => {
    const other = app.jwt.sign({ sub: randomUUID(), email: "other@test.tn" });
    const res = await app.inject({
      method: "GET",
      url: `/v1/applications/${applicationId}`,
      headers: { authorization: `Bearer ${other}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("rotates refresh tokens and revokes the family on reuse", async () => {
    const original = generateOpaqueToken();
    await container.db.insert(refreshTokens).values({
      userId,
      familyId: randomUUID(),
      tokenHash: hashToken(original),
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const first = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: original } });
    expect(first.statusCode).toBe(200);
    const rotated = first.json().refreshToken as string;

    const reuse = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: original } });
    expect(reuse.statusCode).toBe(401);

    const afterTheft = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: rotated } });
    expect(afterTheft.statusCode).toBe(401);
  });
});
