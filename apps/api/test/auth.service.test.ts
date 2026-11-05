import { describe, expect, it } from "vitest";
import type { Config } from "../src/config";
import { AuthService } from "../src/modules/auth/auth.service";
import type { GoogleOAuth } from "../src/modules/auth/google-oauth";

class FakeRedis {
  store = new Map<string, string>();
  async set(key: string, value: string) {
    this.store.set(key, value);
    return "OK";
  }
  async getdel(key: string) {
    const v = this.store.get(key) ?? null;
    this.store.delete(key);
    return v;
  }
}

const config = { WEB_ORIGIN: "https://app.jobia.tn", MOBILE_REDIRECT_URI: "jobia://auth" } as Config;
const google = {
  authorizationUrl: async (state: string) => ({ url: `https://accounts.google.com/o?state=${state}`, codeVerifier: "v" }),
} as unknown as GoogleOAuth;

function service(redis = new FakeRedis()) {
  return { redis, auth: new AuthService({} as never, redis as never, {} as never, google, config) };
}

describe("AuthService.start", () => {
  it("accepts the web and mobile redirect URIs and stores the PKCE verifier", async () => {
    const { auth, redis } = service();
    const url = await auth.start("jobia://auth");
    expect(url).toMatch(/^https:\/\/accounts\.google\.com/);
    const [entry] = [...redis.store.entries()];
    expect(entry?.[0]).toMatch(/^oauth:state:/);
    expect(JSON.parse(entry?.[1] ?? "{}")).toEqual({ redirect: "jobia://auth", codeVerifier: "v" });
  });

  it("rejects open redirects", async () => {
    const { auth } = service();
    await expect(auth.start("https://evil.example/steal")).rejects.toThrow(/not allowed/);
  });

  it("rejects a replayed or expired state", async () => {
    const { auth } = service();
    await expect(auth.callback("code", "unknown-state")).rejects.toThrow(/expired/);
  });

  it("rejects an unknown one-time login code", async () => {
    const { auth } = service();
    await expect(auth.exchange("x".repeat(40), () => "jwt")).rejects.toThrow(/Invalid or expired/);
  });
});
