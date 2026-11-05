import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** High-entropy opaque token (refresh tokens, OAuth `state`). */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Opaque tokens are stored hashed: a database leak must not let an attacker
 * reuse refresh tokens. SHA-256 is fine here because the input has 256 bits
 * of entropy (no need for a slow password hash).
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
