import type { CvDocument } from "@jobia/ai";
import { and, cvs, eq, ne, users } from "@jobia/db";
import type { JobPayloads } from "@jobia/queue";
import { JOB_SOURCES, JobPreferencesSchema } from "@jobia/shared";
import mammoth from "mammoth";
import type { WorkerContext } from "../context";
import { permanent } from "./common";

export async function processCvParse(ctx: WorkerContext, { userId, cvId }: JobPayloads["cv.parse"]): Promise<void> {
  const [cv] = await ctx.db
    .select()
    .from(cvs)
    .where(and(eq(cvs.id, cvId), eq(cvs.userId, userId)))
    .limit(1);
  if (!cv) permanent(`CV ${cvId} not found`);
  if (cv.status === "ready") return; // idempotent replay

  const file = await ctx.files.read(cv.storageKey);
  const doc: CvDocument =
    cv.mimeType === "application/pdf"
      ? { kind: "pdf", base64: file.toString("base64") }
      : { kind: "text", text: (await mammoth.extractRawText({ buffer: file })).value };

  let profile;
  try {
    profile = await ctx.ai.cvParser.parse(doc);
  } catch (error) {
    await ctx.db.update(cvs).set({ status: "failed", error: "Impossible d'analyser ce CV" }).where(eq(cvs.id, cvId));
    throw error;
  }

  await ctx.db.transaction(async (tx) => {
    await tx.update(cvs).set({ isActive: false }).where(and(eq(cvs.userId, userId), ne(cvs.id, cvId)));
    await tx.update(cvs).set({ status: "ready", profile, isActive: true, error: null }).where(eq(cvs.id, cvId));

    // First CV: seed search preferences from what the AI understood.
    const [user] = await tx.select({ preferences: users.preferences, agentMode: users.agentMode }).from(users).where(eq(users.id, userId));
    if (user && !user.preferences) {
      const preferences = JobPreferencesSchema.parse({ agentMode: user.agentMode, targetRoles: profile.targetRoles });
      await tx.update(users).set({ preferences }).where(eq(users.id, userId));
    }
  });

  ctx.logger.info({ userId, cvId }, "cv parsed");
  // Kick off a first discovery immediately so the user sees results quickly.
  await ctx.queues.discovery.addBulk(
    JOB_SOURCES.filter((s) => s !== "email").map((source) => ({ name: "discovery", data: { userId, source } })),
  );
}
