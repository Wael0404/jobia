import { and, cvs, desc, eq, type Database } from "@jobia/db";
import { jobId, type TypedQueue } from "@jobia/queue";
import type { CandidateProfile } from "@jobia/shared";
import type { CvStorage } from "../../infra/storage";
import { BadRequest, NotFound } from "../../http/errors";

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export interface CvDto {
  id: string;
  fileName: string;
  status: "pending_upload" | "parsing" | "ready" | "failed";
  profile: CandidateProfile | null;
  error: string | null;
  createdAt: string;
}

export class CvService {
  constructor(
    private readonly db: Database,
    private readonly storage: CvStorage,
    private readonly parseQueue: TypedQueue<"cv.parse">,
  ) {}

  async createUpload(userId: string, input: { fileName: string; mimeType: string; sizeBytes: number }) {
    const [cv] = await this.db
      .insert(cvs)
      .values({ userId, storageKey: "", fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes })
      .returning({ id: cvs.id });
    if (!cv) throw new Error("CV insert failed");

    const storageKey = `users/${userId}/cvs/${cv.id}.${EXTENSIONS[input.mimeType] ?? "bin"}`;
    await this.db.update(cvs).set({ storageKey }).where(eq(cvs.id, cv.id));
    const uploadUrl = await this.storage.presignUpload(storageKey, input.mimeType, input.sizeBytes);
    // Every header signed into the presigned URL must be sent by the client, or S3 rejects the PUT.
    return {
      cvId: cv.id,
      uploadUrl,
      headers: { "Content-Type": input.mimeType, "x-amz-server-side-encryption": "AES256" },
    };
  }

  /** Called by the client once the direct-to-S3 upload has finished. */
  async confirmUpload(userId: string, cvId: string): Promise<CvDto> {
    const cv = await this.find(userId, cvId);
    if (cv.status !== "pending_upload") return this.toDto(cv);

    const size = await this.storage.sizeOf(cv.storageKey);
    if (size === null) throw BadRequest("File not uploaded yet");
    if (size !== cv.sizeBytes) throw BadRequest("Uploaded file size mismatch");

    const [updated] = await this.db.update(cvs).set({ status: "parsing" }).where(eq(cvs.id, cv.id)).returning();
    const payload = { userId, cvId };
    await this.parseQueue.add("cv.parse", payload, { jobId: jobId.cvParse(payload) });
    return this.toDto(updated ?? cv);
  }

  async latest(userId: string): Promise<CvDto | null> {
    const [cv] = await this.db.select().from(cvs).where(eq(cvs.userId, userId)).orderBy(desc(cvs.createdAt)).limit(1);
    return cv ? this.toDto(cv) : null;
  }

  private async find(userId: string, cvId: string) {
    const [cv] = await this.db
      .select()
      .from(cvs)
      .where(and(eq(cvs.id, cvId), eq(cvs.userId, userId)))
      .limit(1);
    if (!cv) throw NotFound("CV");
    return cv;
  }

  private toDto(cv: typeof cvs.$inferSelect): CvDto {
    return {
      id: cv.id,
      fileName: cv.fileName,
      status: cv.status,
      profile: cv.profile ?? null,
      error: cv.error,
      createdAt: cv.createdAt.toISOString(),
    };
  }
}
