import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Config } from "../config";

/**
 * CVs never transit through the API: clients upload directly to object
 * storage with a short-lived presigned URL. This keeps API pods light.
 */
export class CvStorage {
  /** Server-side operations (HEAD) use the internal endpoint… */
  private readonly s3: S3Client;
  /** …while presigned URLs must point to an endpoint the client device can reach. */
  private readonly presigner: S3Client;
  private readonly bucket: string;

  constructor(config: Config) {
    this.bucket = config.S3_BUCKET;
    const client = (endpoint: string | undefined) =>
      new S3Client({
        region: config.S3_REGION,
        endpoint,
        forcePathStyle: Boolean(endpoint),
        credentials:
          config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
            ? { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }
            : undefined,
      });
    this.s3 = client(config.S3_ENDPOINT);
    this.presigner = client(config.S3_PUBLIC_ENDPOINT ?? config.S3_ENDPOINT);
  }

  presignUpload(key: string, mimeType: string, sizeBytes: number): Promise<string> {
    return getSignedUrl(
      this.presigner,
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
