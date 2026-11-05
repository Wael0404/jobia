import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { WorkerConfig } from "../config";

export class CvFiles {
  private readonly s3: S3Client;

  constructor(private readonly config: WorkerConfig) {
    this.s3 = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: Boolean(config.S3_ENDPOINT),
      credentials:
        config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async read(key: string): Promise<Buffer> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }));
    if (!res.Body) throw new Error(`Empty object ${key}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  /**
   * Materialises the CV on local disk for browser upload, and guarantees the
   * temporary copy is deleted afterwards (CVs contain personal data).
   */
  async withLocalCopy<T>(key: string, fileName: string, fn: (path: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), "jobia-cv-"));
    try {
      const path = join(dir, basename(fileName).replace(/[^\w.\-]/g, "_"));
      await writeFile(path, await this.read(key), { mode: 0o600 });
      return await fn(path);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
