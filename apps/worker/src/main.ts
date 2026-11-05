import { QUEUES, redisConnection, type JobPayloads, type QueueName } from "@jobia/queue";
import { Worker, type Job } from "bullmq";
import { loadConfig } from "./config";
import { createContext, type WorkerContext } from "./context";
import { processCvParse } from "./processors/cv-parse";
import { processDiscovery } from "./processors/discovery";
import { processInboxSync } from "./processors/inbox-sync";
import { processMatch } from "./processors/match";
import { processSchedulerTick, SCHEDULER_EVERY_MS } from "./processors/scheduler";
import { processSubmit } from "./processors/submit";

type Processor<N extends QueueName> = (ctx: WorkerContext, data: JobPayloads[N], job: Job, token?: string) => Promise<void>;

const PROCESSORS: { [N in QueueName]: Processor<N> } = {
  [QUEUES.cvParse]: processCvParse,
  [QUEUES.discovery]: processDiscovery,
  [QUEUES.match]: processMatch,
  [QUEUES.submit]: processSubmit,
  [QUEUES.inboxSync]: processInboxSync,
  [QUEUES.scheduler]: (ctx) => processSchedulerTick(ctx),
};

/** Browser queues are memory-hungry (≈300 MB per context): keep their concurrency low. */
function concurrencyFor(name: QueueName, ctx: WorkerContext): number {
  if (name === QUEUES.discovery || name === QUEUES.submit) return ctx.config.BROWSER_CONCURRENCY;
  if (name === QUEUES.scheduler) return 1;
  return ctx.config.LLM_CONCURRENCY;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const ctx = createContext(config);
  const connection = redisConnection(config.REDIS_URL);

  const workers = config.WORKER_QUEUES.map((name) => {
    const processor = PROCESSORS[name] as Processor<QueueName>;
    const worker = new Worker(name, (job, token) => processor(ctx, job.data as never, job, token), {
      connection,
      concurrency: concurrencyFor(name, ctx),
      // Per-queue global rate limit protects the LLM and third-party sites.
      limiter: name === QUEUES.submit ? { max: 50, duration: 1_000 } : undefined,
    });
    worker.on("failed", (job, error) => ctx.logger.error({ queue: name, jobId: job?.id, err: error }, "job failed"));
    return worker;
  });

  if (config.WORKER_QUEUES.includes(QUEUES.scheduler)) {
    await ctx.queues.scheduler.upsertJobScheduler(QUEUES.scheduler, { every: SCHEDULER_EVERY_MS }, { name: "scheduler", data: {} });
  }
  ctx.logger.info({ queues: config.WORKER_QUEUES }, "workers started");

  const shutdown = async () => {
    ctx.logger.info("draining workers");
    await Promise.all(workers.map((w) => w.close()));
    await ctx.close();
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
