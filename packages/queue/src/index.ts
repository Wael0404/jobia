import type { JobSourceId } from "@jobia/shared";
import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";

/**
 * Every asynchronous step of the agent pipeline is a queue. Workers for each
 * queue are deployed and autoscaled independently (browser workers are far
 * more expensive than CV-parsing workers).
 *
 *   cv.parse ─▶ discovery ─▶ match ─▶ submit ─▶ (employer) ─▶ inbox.sync
 */
export const QUEUES = {
  cvParse: "cv.parse",
  discovery: "discovery",
  match: "match",
  submit: "submit",
  inboxSync: "inbox.sync",
  /** Periodic fan-out: finds users due for discovery / inbox sync. */
  scheduler: "scheduler",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface JobPayloads {
  [QUEUES.cvParse]: { userId: string; cvId: string };
  [QUEUES.discovery]: { userId: string; source: JobSourceId };
  [QUEUES.match]: { userId: string; jobOfferIds: string[] };
  [QUEUES.submit]: { userId: string; applicationId: string };
  [QUEUES.inboxSync]: { userId: string };
  [QUEUES.scheduler]: Record<string, never>;
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: { age: 24 * 3600, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

export type TypedQueue<N extends QueueName> = Queue<JobPayloads[N], unknown, N>;

export function createQueue<N extends QueueName>(name: N, connection: ConnectionOptions): TypedQueue<N> {
  return new Queue<JobPayloads[N], unknown, N>(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
}

/**
 * Deterministic job ids make enqueueing idempotent: double-clicking
 * "re-parse" or a retried HTTP request never produces two jobs.
 */
export const jobId = {
  cvParse: (p: JobPayloads["cv.parse"]) => `cv-${p.cvId}`,
  discovery: (p: JobPayloads["discovery"], windowStart: number) => `disc-${p.userId}-${p.source}-${windowStart}`,
  submit: (p: JobPayloads["submit"]) => `submit-${p.applicationId}`,
  inboxSync: (p: JobPayloads["inbox.sync"], windowStart: number) => `inbox-${p.userId}-${windowStart}`,
};

export function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    tls: u.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
