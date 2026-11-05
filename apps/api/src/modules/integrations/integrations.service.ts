import { and, eq, integrations, type Database, type IntegrationProvider } from "@jobia/db";
import type { TypedQueue } from "@jobia/queue";
import type { SecretVault } from "@jobia/security";
import type { BoardProvider, IntegrationDto } from "@jobia/shared";
import type { Config } from "../../config";
import { BadRequest, NotFound } from "../../http/errors";

export class IntegrationsService {
  constructor(
    private readonly db: Database,
    private readonly vault: SecretVault,
    private readonly discoveryQueue: TypedQueue<"discovery">,
    private readonly config: Config,
  ) {}

  async list(userId: string): Promise<IntegrationDto[]> {
    const rows = await this.db
      .select({
        provider: integrations.provider,
        status: integrations.status,
        account: integrations.externalAccountId,
        lastError: integrations.lastError,
        updatedAt: integrations.updatedAt,
      })
      .from(integrations)
      .where(eq(integrations.userId, userId));
    return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
  }

  /**
   * Stores job-board credentials, encrypted with the vault and bound to
   * (user, provider). They are only ever decrypted inside a browser worker.
   * A discovery run is enqueued right away; it validates the login.
   */
  async connectBoard(userId: string, input: { provider: BoardProvider; login: string; password: string }): Promise<void> {
    if (input.provider === "linkedin" && !this.config.FEATURE_LINKEDIN_AUTOMATION) {
      throw BadRequest("LinkedIn automation is not enabled on this platform");
    }
    const encryptedSecret = await this.vault.encrypt(
      JSON.stringify({ login: input.login, password: input.password }),
      `user:${userId}:${input.provider}`,
    );
    await this.db
      .insert(integrations)
      .values({ userId, provider: input.provider, externalAccountId: input.login, encryptedSecret })
      .onConflictDoUpdate({
        target: [integrations.userId, integrations.provider],
        set: {
          externalAccountId: input.login,
          encryptedSecret,
          encryptedSession: null,
          status: "connected",
          lastError: null,
        },
      });
    await this.discoveryQueue.add("discovery", { userId, source: input.provider });
  }

  async disconnect(userId: string, provider: IntegrationProvider): Promise<void> {
    const deleted = await this.db
      .delete(integrations)
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, provider)))
      .returning({ id: integrations.id });
    if (deleted.length === 0) throw NotFound("Integration");
  }
}
