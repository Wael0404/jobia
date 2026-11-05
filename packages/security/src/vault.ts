import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Envelope encryption for third-party secrets (Google refresh tokens,
 * job-board passwords, browser session cookies).
 *
 *  - Every secret gets its own random 256-bit data key (DEK).
 *  - The payload is encrypted with the DEK using AES-256-GCM.
 *  - The DEK itself is wrapped with the master key (KEK).
 *
 * The KEK is provided by a `KeyProvider`. Locally it comes from an env
 * variable; in production plug a KMS-backed provider (AWS KMS / GCP KMS /
 * Vault Transit) so the master key never lives in application memory dumps.
 *
 * `aad` binds a ciphertext to its owner (e.g. `user:<id>:linkedin`), so a
 * ciphertext copied onto another row fails to decrypt.
 */

export interface KeyProvider {
  readonly keyId: string;
  wrap(dek: Buffer): Promise<Buffer>;
  unwrap(wrapped: Buffer, keyId: string): Promise<Buffer>;
}

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const VERSION = "v1";

function seal(key: Buffer, plaintext: Buffer, aad: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  cipher.setAAD(aad);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

function open(key: Buffer, sealed: Buffer, aad: Buffer): Buffer {
  const iv = sealed.subarray(0, IV_BYTES);
  const tag = sealed.subarray(IV_BYTES, IV_BYTES + 16);
  const body = sealed.subarray(IV_BYTES + 16);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

/** Local KEK provider. Suitable for development and single-tenant deployments only. */
export class StaticKeyProvider implements KeyProvider {
  readonly keyId = "static-1";
  private readonly kek: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, "base64");
    if (key.length !== 32) throw new Error("VAULT_MASTER_KEY must be 32 bytes encoded in base64");
    this.kek = key;
  }

  async wrap(dek: Buffer): Promise<Buffer> {
    return seal(this.kek, dek, Buffer.from(this.keyId));
  }

  async unwrap(wrapped: Buffer, keyId: string): Promise<Buffer> {
    if (keyId !== this.keyId) throw new Error(`Unknown key id ${keyId}`);
    return open(this.kek, wrapped, Buffer.from(keyId));
  }
}

export class SecretVault {
  constructor(private readonly keys: KeyProvider) {}

  /** Returns an opaque, self-describing string safe to store in the database. */
  async encrypt(plaintext: string, aad: string): Promise<string> {
    const dek = randomBytes(32);
    const payload = seal(dek, Buffer.from(plaintext, "utf8"), Buffer.from(aad));
    const wrappedDek = await this.keys.wrap(dek);
    dek.fill(0);
    return [VERSION, this.keys.keyId, wrappedDek.toString("base64"), payload.toString("base64")].join(".");
  }

  async decrypt(token: string, aad: string): Promise<string> {
    const [version, keyId, wrappedDek, payload] = token.split(".");
    if (version !== VERSION || !keyId || !wrappedDek || !payload) throw new Error("Malformed vault token");
    const dek = await this.keys.unwrap(Buffer.from(wrappedDek, "base64"), keyId);
    try {
      return open(dek, Buffer.from(payload, "base64"), Buffer.from(aad)).toString("utf8");
    } finally {
      dek.fill(0);
    }
  }
}
