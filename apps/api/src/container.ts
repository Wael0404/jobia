import { createDatabase, type Database } from "@jobia/db";
import { createQueue, QUEUES, redisConnection, type TypedQueue } from "@jobia/queue";
import { SecretVault, StaticKeyProvider } from "@jobia/security";
import { Redis } from "ioredis";
import type { Config } from "./config";
import { CvStorage } from "./infra/storage";
import { ApplicationsService } from "./modules/applications/applications.service";
import { AuthService } from "./modules/auth/auth.service";
import { GoogleOAuth } from "./modules/auth/google-oauth";
import { CvService } from "./modules/cv/cv.service";
import { IntegrationsService } from "./modules/integrations/integrations.service";
import { MeService } from "./modules/me/me.service";
import { ReportsService } from "./modules/reports/reports.service";

/**
 * Composition root: the only place that knows concrete implementations.
 * Services receive their dependencies through constructors, which keeps
 * them trivially unit-testable.
 */
export interface Container {
  config: Config;
  db: Database;
  redis: Redis;
  queues: {
    cvParse: TypedQueue<typeof QUEUES.cvParse>;
    submit: TypedQueue<typeof QUEUES.submit>;
    discovery: TypedQueue<typeof QUEUES.discovery>;
  };
  services: {
    auth: AuthService;
    me: MeService;
    cv: CvService;
    integrations: IntegrationsService;
    applications: ApplicationsService;
    reports: ReportsService;
  };
  close(): Promise<void>;
}

export function createContainer(config: Config): Container {
  const { db, close: closeDb } = createDatabase({
    url: config.DATABASE_URL,
    maxConnections: config.DATABASE_POOL_SIZE,
    applicationName: "jobia-api",
  });
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2, enableAutoPipelining: true });
  const connection = redisConnection(config.REDIS_URL);
  const queues = {
    cvParse: createQueue(QUEUES.cvParse, connection),
    submit: createQueue(QUEUES.submit, connection),
    discovery: createQueue(QUEUES.discovery, connection),
  };
  const vault = new SecretVault(new StaticKeyProvider(config.VAULT_MASTER_KEY));
  const google = new GoogleOAuth(config);

  return {
    config,
    db,
    redis,
    queues,
    services: {
      auth: new AuthService(db, redis, vault, google, config),
      me: new MeService(db),
      cv: new CvService(db, new CvStorage(config), queues.cvParse),
      integrations: new IntegrationsService(db, vault, queues.discovery, config),
      applications: new ApplicationsService(db, queues.submit),
      reports: new ReportsService(db, redis),
    },
    async close() {
      await Promise.all(Object.values(queues).map((q) => q.close()));
      await redis.quit();
      await closeDb();
    },
  };
}
