import { QUEUES, type QueueName } from "@jobia/queue";
import { z } from "zod";

const ALL_QUEUES = Object.values(QUEUES) as [QueueName, ...QueueName[]];

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().int().default(5),
  REDIS_URL: z.string().url(),

  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string(),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  VAULT_MASTER_KEY: z.string().min(40),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  /** "mock" = free local heuristics instead of Claude, for local testing only. */
  AI_PROVIDER: z.enum(["anthropic", "mock"]).default("anthropic"),
  /**
   * "browser" = log into each board with the user's account (Playwright).
   * "http" = read public search pages over plain HTTP, no login, no browser.
   */
  DISCOVERY_MODE: z.enum(["browser", "http"]).default("browser"),

  /**
   * Which queues this process consumes. Deploy browser queues (discovery,
   * submit) on dedicated, larger pods and scale them on queue depth.
   */
  WORKER_QUEUES: z
    .string()
    .default(ALL_QUEUES.join(","))
    .transform((v) => v.split(",").map((q) => q.trim()))
    .pipe(z.array(z.enum(ALL_QUEUES))),
  BROWSER_CONCURRENCY: z.coerce.number().int().min(1).default(3),
  LLM_CONCURRENCY: z.coerce.number().int().min(1).default(20),

  FEATURE_LINKEDIN_AUTOMATION: z.stringbool().default(false),
  AGENT_MAX_APPLICATIONS_PER_DAY: z.coerce.number().int().default(40),
  AGENT_MAX_PER_SOURCE_PER_DAY: z.coerce.number().int().default(15),
  AGENT_DISCOVERY_INTERVAL_MINUTES: z.coerce.number().int().default(180),
});

export type WorkerConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid worker configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  return parsed.data;
}
