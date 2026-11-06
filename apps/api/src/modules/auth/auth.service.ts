import { and, eq, integrations, isNull, refreshTokens, users, type Database } from "@jobia/db";
import { generateOpaqueToken, hashToken, type SecretVault } from "@jobia/security";
import type { AuthTokens } from "@jobia/shared";
import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import type { Config } from "../../config";
import { BadRequest, Unauthorized } from "../../http/errors";
import type { GoogleOAuth } from "./google-oauth";

const STATE_TTL_S = 600;
const LOGIN_CODE_TTL_S = 60;

interface PendingLogin {
  redirect: string;
  codeVerifier: string;
}

export type SignAccessToken = (claims: { sub: string; email: string }) => string;

/**
 * Sign-in flow (identical for web and mobile, secrets stay server-side):
 *
 *  1. GET  /auth/google/start?redirect=…   → 302 to Google (PKCE + state in Redis)
 *  2. GET  /auth/google/callback           → user upserted, 302 to `redirect?code=<one-time code>`
 *  3. POST /auth/exchange {code}           → { accessToken (JWT, 15 min), refreshToken (opaque, rotating) }
 *  4. POST /auth/refresh {refreshToken}    → rotation; reusing an old token revokes the whole family
 */
export class AuthService {
  private readonly allowedRedirects: Set<string>;

  constructor(
    private readonly db: Database,
    private readonly redis: Redis,
    private readonly vault: SecretVault,
    private readonly google: GoogleOAuth,
    private readonly config: Config,
  ) {
    this.allowedRedirects = new Set([...config.WEB_ORIGIN.map((o) => `${o}/auth/callback`), config.MOBILE_REDIRECT_URI]);
  }

  async start(redirect: string): Promise<string> {
    if (!this.allowedRedirects.has(redirect)) throw BadRequest("Redirect URI not allowed");
    const state = generateOpaqueToken();
    const { url, codeVerifier } = await this.google.authorizationUrl(state);
    const pending: PendingLogin = { redirect, codeVerifier };
    await this.redis.set(`oauth:state:${state}`, JSON.stringify(pending), "EX", STATE_TTL_S);
    return url;
  }

  /** Returns the URL the browser must be redirected to (the app, carrying a one-time code). */
  async callback(code: string, state: string): Promise<string> {
    const raw = await this.redis.getdel(`oauth:state:${state}`);
    if (!raw) throw BadRequest("Login session expired, please try again");
    const pending = JSON.parse(raw) as PendingLogin;

    const identity = await this.google.exchange(code, pending.codeVerifier);
    const userId = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ googleSub: identity.sub, email: identity.email, name: identity.name, avatarUrl: identity.picture })
        .onConflictDoUpdate({
          target: users.googleSub,
          set: { email: identity.email, name: identity.name, avatarUrl: identity.picture },
        })
        .returning({ id: users.id });
      if (!user) throw new Error("User upsert failed");

      if (identity.refreshToken) {
        const encryptedSecret = await this.vault.encrypt(identity.refreshToken, `user:${user.id}:google`);
        await tx
          .insert(integrations)
          .values({
            userId: user.id,
            provider: "google",
            externalAccountId: identity.email,
            scopes: identity.grantedScopes,
            encryptedSecret,
          })
          .onConflictDoUpdate({
            target: [integrations.userId, integrations.provider],
            set: { encryptedSecret, scopes: identity.grantedScopes, status: "connected", lastError: null },
          });
      }
      return user.id;
    });

    const loginCode = generateOpaqueToken();
    await this.redis.set(`oauth:code:${loginCode}`, userId, "EX", LOGIN_CODE_TTL_S);
    const target = new URL(pending.redirect);
    target.searchParams.set("code", loginCode);
    return target.toString();
  }

  async exchange(code: string, sign: SignAccessToken): Promise<AuthTokens> {
    const userId = await this.redis.getdel(`oauth:code:${code}`);
    if (!userId) throw Unauthorized("Invalid or expired login code");
    return this.issue(userId, randomUUID(), sign);
  }

  async refresh(refreshToken: string, sign: SignAccessToken): Promise<AuthTokens> {
    const tokenHash = hashToken(refreshToken);
    const [stored] = await this.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
    if (!stored) throw Unauthorized("Invalid refresh token");

    if (stored.revokedAt) {
      // Reuse of a rotated token = probable theft: revoke the whole family.
      await this.revokeFamily(stored.familyId);
      throw Unauthorized("Session revoked");
    }
    if (stored.expiresAt < new Date()) throw Unauthorized("Session expired");

    const [rotated] = await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, stored.id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });
    if (!rotated) throw Unauthorized("Session revoked"); // lost a concurrent refresh race

    return this.issue(stored.userId, stored.familyId, sign);
  }

  async logout(refreshToken: string): Promise<void> {
    const [stored] = await this.db
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashToken(refreshToken)))
      .limit(1);
    if (stored) await this.revokeFamily(stored.familyId);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  private async issue(userId: string, familyId: string, sign: SignAccessToken): Promise<AuthTokens> {
    const [user] = await this.db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw Unauthorized("Unknown user");

    const refreshToken = generateOpaqueToken();
    await this.db.insert(refreshTokens).values({
      userId,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    });
    return {
      accessToken: sign({ sub: userId, email: user.email }),
      refreshToken,
      expiresIn: this.config.JWT_ACCESS_TTL_SECONDS,
    };
  }
}
