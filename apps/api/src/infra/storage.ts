import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Config } from "../config";

/**
 * CVs never transit through the API: clients upload directly to object
 * storage with a short-lived presigned URL. This keeps API pods light.
 */
export class CvStorage {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: Config) {
    this.bucket = config.S3_BUCKET;
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

  presignUpload(key: string, mimeType: string, sizeBytes: number): Promise<string> {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mimeType,
        ContentLength: sizeBytes,
        ServerSideEncryption: "AES256",
      }),
      { expiresIn: 300 },
    );
  }

  async sizeOf(key: string): Promise<number | null> {
    try {
      const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return head.ContentLength ?? null;
    } catch {
      return null;
    }
  }
}
