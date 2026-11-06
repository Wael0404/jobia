import { ApplicationWriter, CvParser, EmailClassifier, FormAnswerer, JobMatcher, Llm, RecruiterContactFinder } from "@jobia/ai";
import { ConnectorRegistry } from "@jobia/connectors";
import { and, createDatabase, eq, integrations, type Database, type IntegrationProvider } from "@jobia/db";
import { createQueue, QUEUES, redisConnection, type TypedQueue } from "@jobia/queue";
import { SecretVault, StaticKeyProvider } from "@jobia/security";
import { Redis } from "ioredis";
import pino, { type Logger } from "pino";
import type { WorkerConfig } from "./config";
import { BrowserPool } from "./infra/browser-pool";
import { DailyQuota } from "./infra/daily-quota";
import { GmailMailbox } from "./infra/gmail";
import { fetchPublicText } from "./infra/safe-fetch";
import { CvFiles } from "./infra/storage";
import { OfferContactResolver } from "./services/offer-contacts";

/** Everything a processor may need. Built once per process (composition root). */
export interface WorkerContext {
  config: WorkerConfig;
  logger: Logger;
  db: Database;
  redis: Redis;
  vault: SecretVault;
  files: CvFiles;
  browsers: BrowserPool;
  connectors: ConnectorRegistry;
  quota: DailyQuota;
  /** Recruiter email research for LinkedIn Easy Apply offers (cached per offer). */
  contacts: OfferContactResolver;
  ai: {
    cvParser: CvParser;
    matcher: JobMatcher;
    writer: ApplicationWriter;
    forms: FormAnswerer;
    inbox: EmailClassifier;
  };
  queues: {
    discovery: TypedQueue<typeof QUEUES.discovery>;
    match: TypedQueue<typeof QUEUES.match>;
    submit: TypedQueue<typeof QUEUES.submit>;
    inboxSync: TypedQueue<typeof QUEUES.inboxSync>;
    scheduler: TypedQueue<typeof QUEUES.scheduler>;
  };
  secrets: IntegrationSecrets;
  close(): Promise<void>;
}

/** Decrypts / persists per-user third-party secrets. The only code path that touches plaintext credentials. */
export class IntegrationSecrets {
  constructor(
    private readonly db: Database,
    private readonly vault: SecretVault,
    private readonly config: WorkerConfig,
  ) {}

  private aad(userId: string, provider: IntegrationProvider, kind: "secret" | "session"): string {
    // The secret's AAD matches the API's (user:<id>:<provider>); sessions get their own suffix.
    return kind === "secret" ? `user:${userId}:${provider}` : `user:${userId}:${provider}:session`;
  }

  async load(userId: string, provider: IntegrationProvider) {
    const [row] = await this.db
      .select()
      .from(integrations)
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, provider)))
      .limit(1);
    if (!row || row.status === "disabled" || !row.encryptedSecret) return null;
    const secret = await this.vault.decrypt(row.encryptedSecret, this.aad(userId, provider, "secret"));
    const session = row.encryptedSession
      ? await this.vault.decrypt(row.encryptedSession, this.aad(userId, provider, "session")).catch(() => null)
      : null;
    return { row, secret, session };
  }

  async saveSession(userId: string, provider: IntegrationProvider, storageState: string): Promise<void> {
    const encryptedSession = await this.vault.encrypt(storageState, this.aad(userId, provider, "session"));
    await this.db
      .update(integrations)
      .set({ encryptedSession, status: "connected", lastError: null })
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, provider)));
  }

  async markNeedsReauth(userId: string, provider: IntegrationProvider, reason: string): Promise<void> {
    await this.db
      .update(integrations)
      .set({ status: "needs_reauth", lastError: reason, encryptedSession: null })
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, provider)));
  }

  async gmail(userId: string): Promise<GmailMailbox | null> {
    const google = await this.load(userId, "google");
    if (!google) return null;
    return new GmailMailbox(this.config.GOOGLE_CLIENT_ID, this.config.GOOGLE_CLIENT_SECRET, google.secret);
  }
}

export function createContext(config: WorkerConfig): WorkerContext {
  const logger = pino({ level: config.LOG_LEVEL, redact: ["password", "secret", "refreshToken"] });
  const { db, close: closeDb } = createDatabase({
    url: config.DATABASE_URL,
    maxConnections: config.DATABASE_POOL_SIZE,
    applicationName: "jobia-worker",
  });
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const connection = redisConnection(config.REDIS_URL);
  const vault = new SecretVault(new StaticKeyProvider(config.VAULT_MASTER_KEY));
  const llm = new Llm({ apiKey: config.ANTHROPIC_API_KEY, model: config.AI_MODEL });
  const browsers = new BrowserPool();
  const queues = {
    discovery: createQueue(QUEUES.discovery, connection),
    match: createQueue(QUEUES.match, connection),
    submit: createQueue(QUEUES.submit, connection),
    inboxSync: createQueue(QUEUES.inboxSync, connection),
    scheduler: createQueue(QUEUES.scheduler, connection),
  };

  return {
    config,
    logger,
    db,
    redis,
    vault,
    files: new CvFiles(config),
    browsers,
    connectors: new ConnectorRegistry({ linkedinEnabled: config.FEATURE_LINKEDIN_AUTOMATION }),
    quota: new DailyQuota(redis, {
      perUser: config.AGENT_MAX_APPLICATIONS_PER_DAY,
      perSource: config.AGENT_MAX_PER_SOURCE_PER_DAY,
    }),
    contacts: new OfferContactResolver(
      db,
      new RecruiterContactFinder({ apiKey: config.ANTHROPIC_API_KEY, model: config.AI_MODEL }),
      fetchPublicText,
      logger,
    ),
    ai: {
      cvParser: new CvParser(llm),
      matcher: new JobMatcher(llm),
      writer: new ApplicationWriter(llm),
      forms: new FormAnswerer(llm),
      inbox: new EmailClassifier(llm),
    },
    queues,
    secrets: new IntegrationSecrets(db, vault, config),
    async close() {
      await browsers.close();
      await Promise.all(Object.values(queues).map((q) => q.close()));
      await redis.quit();
      await closeDb();
    },
  };
}
