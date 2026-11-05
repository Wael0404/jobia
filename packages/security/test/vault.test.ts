import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SecretVault, StaticKeyProvider } from "../src/vault";

const vault = new SecretVault(new StaticKeyProvider(randomBytes(32).toString("base64")));

describe("SecretVault", () => {
  it("round-trips a secret", async () => {
    const token = await vault.encrypt("s3cr3t", "user:1:linkedin");
    expect(token).not.toContain("s3cr3t");
    await expect(vault.decrypt(token, "user:1:linkedin")).resolves.toBe("s3cr3t");
  });

  it("refuses a ciphertext bound to another owner", async () => {
    const token = await vault.encrypt("s3cr3t", "user:1:linkedin");
    await expect(vault.decrypt(token, "user:2:linkedin")).rejects.toThrow();
  });

  it("produces a different ciphertext each time", async () => {
    const [a, b] = await Promise.all([vault.encrypt("x", "a"), vault.encrypt("x", "a")]);
    expect(a).not.toBe(b);
  });
});
