import { describe, expect, it } from "vitest";
import { fetchPublicText, isPrivateAddress } from "../src/infra/safe-fetch";

describe("SSRF guard", () => {
  it("flags private, loopback and metadata addresses", () => {
    for (const ip of ["10.0.0.5", "127.0.0.1", "172.20.1.1", "192.168.1.10", "169.254.169.254", "::1", "fd00::1", "::ffff:10.1.2.3"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "41.226.10.10", "2a00:1450:4007::"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("refuses to fetch internal services", async () => {
    await expect(fetchPublicText("http://127.0.0.1:6379/")).rejects.toThrow(/Private address/);
    await expect(fetchPublicText("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/Private address/);
    await expect(fetchPublicText("file:///etc/passwd")).rejects.toThrow(/protocol/);
  });
});
