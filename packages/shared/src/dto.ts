import { z } from "zod";
import { AGENT_MODES, APPLICATION_STATUSES, JOB_SOURCES } from "./domain";

/* ---------- Auth ---------- */

/** Where the API may send the user back after Google sign-in (web dashboard or mobile deep link). */
export const GoogleStartQuerySchema = z.object({ redirect: z.string().url() });

/** One-time code returned to the client after the OAuth callback, exchanged for tokens. */
export const ExchangeCodeSchema = z.object({ code: z.string().min(20).max(200) });

export const RefreshRequestSchema = z.object({ refreshToken: z.string().min(1) });

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  agentMode: (typeof AGENT_MODES)[number];
  hasCv: boolean;
}

/* ---------- CV ---------- */

export const CV_MAX_BYTES = 10 * 1024 * 1024;
export const CV_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const CreateCvUploadSchema = z.object({
  fileName: z.string().min(1).max(200),
  mimeType: z.enum(CV_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(CV_MAX_BYTES),
});

export const ConfirmCvUploadSchema = z.object({ cvId: z.string().uuid() });

/* ---------- Preferences ---------- */

export const JobPreferencesSchema = z.object({
  agentMode: z.enum(AGENT_MODES),
  countries: z.array(z.string().length(2)).min(1).default(["TN"]),
  cities: z.array(z.string()).default([]),
  remoteOk: z.boolean().default(true),
  targetRoles: z.array(z.string()).default([]),
  excludedCompanies: z.array(z.string()).default([]),
  minMatchScore: z.number().int().min(0).max(100).default(70),
  maxApplicationsPerDay: z.number().int().min(1).max(100).default(30),
  enabledSources: z.array(z.enum(JOB_SOURCES)).default(["linkedin", "tanitjobs", "keejob", "emploitunisie", "email"]),
});
export type JobPreferences = z.infer<typeof JobPreferencesSchema>;

/* ---------- Integrations ---------- */

export const BOARD_PROVIDERS = ["linkedin", "tanitjobs", "keejob", "emploitunisie"] as const;
export type BoardProvider = (typeof BOARD_PROVIDERS)[number];

export const ConnectBoardSchema = z.object({
  provider: z.enum(BOARD_PROVIDERS),
  login: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
  /** The user explicitly accepted the automation risk shown in the app (mandatory for LinkedIn). */
  acceptedRisk: z.literal(true),
});

export interface IntegrationDto {
  provider: "google" | BoardProvider;
  status: "connected" | "needs_reauth" | "disabled";
  account: string | null;
  lastError: string | null;
  updatedAt: string;
}

/* ---------- Applications ---------- */

export const ListApplicationsQuerySchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  source: z.enum(JOB_SOURCES).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListApplicationsQuery = z.infer<typeof ListApplicationsQuerySchema>;

export interface ApplicationDto {
  id: string;
  status: (typeof APPLICATION_STATUSES)[number];
  source: (typeof JOB_SOURCES)[number];
  matchScore: number;
  job: { title: string; company: string; location: string | null; url: string };
  submittedAt: string | null;
  updatedAt: string;
  lastEvent: string | null;
}

/** Answers the user typed for questions the agent could not answer; reused for future forms. */
export const SaveAnswersSchema = z.object({
  answers: z.record(z.string().min(1).max(300), z.string().max(2_000)),
});

export interface ApplicationEventDto {
  id: string;
  actor: "agent" | "user" | "employer" | "system";
  fromStatus: string | null;
  toStatus: string | null;
  message: string;
  occurredAt: string;
}

export interface ApplicationDetailDto extends ApplicationDto {
  coverLetter: string | null;
  matchReasons: string[];
  pendingQuestions: string[];
  events: ApplicationEventDto[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/* ---------- Reports ---------- */

export interface ReportSummaryDto {
  totals: Record<(typeof APPLICATION_STATUSES)[number], number>;
  bySource: Array<{ source: (typeof JOB_SOURCES)[number]; count: number }>;
  appliedLast7Days: Array<{ day: string; count: number }>;
  upcomingInterviews: Array<{
    applicationId: string;
    company: string;
    title: string;
    scheduledAt: string;
    location: string | null;
  }>;
}

/** Progress of a job search started from the dashboard. Only counts, never the details of the crawl. */
export interface AgentSearchStatusDto {
  status: "idle" | "running" | "done";
  startedAt: string | null;
  finishedAt: string | null;
  /** Offers read on the job boards during the last search. */
  offersFound: number;
}
