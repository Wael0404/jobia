import type { ApplyChannel, JobSourceId } from "@jobia/shared";
import type { Page } from "playwright";

/**
 * A connector knows how to talk to ONE recruitment website.
 * Adding a new website = adding a new connector; nothing else changes
 * (open/closed principle). Connectors are stateless: all state (session,
 * credentials) is injected through the context.
 */
export interface JobSourceConnector {
  readonly id: JobSourceId;
  readonly displayName: string;
  /** Polite crawling: minimum delay between two page navigations. */
  readonly minActionDelayMs: number;

  login(ctx: ConnectorContext): Promise<LoginResult>;
  isLoggedIn(ctx: ConnectorContext): Promise<boolean>;
  search(ctx: ConnectorContext, query: SearchQuery): Promise<DiscoveredOffer[]>;
  apply(ctx: ConnectorContext, offer: OfferRef, applicant: Applicant): Promise<ApplyResult>;
}

export interface ConnectorContext {
  page: Page;
  credentials: { login: string; password: string } | null;
  logger: ConnectorLogger;
  signal?: AbortSignal;
}

export interface ConnectorLogger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
}

export type LoginResult =
  | { status: "ok" }
  | { status: "invalid_credentials" }
  /** 2FA, captcha, "verify it's you" page… the user must act in the app. */
  | { status: "challenge"; reason: string };

export interface SearchQuery {
  keywords: string[];
  location: string | null;
  countryCode: string;
  remoteOk: boolean;
  postedWithinDays: number;
  limit: number;
}

export interface DiscoveredOffer {
  source: JobSourceId;
  externalId: string;
  url: string;
  title: string;
  company: string;
  location: string | null;
  description: string;
  applyChannel: ApplyChannel;
  applyEmail: string | null;
  postedAt: Date | null;
}

export interface OfferRef {
  externalId: string;
  url: string;
  title: string;
  company: string;
}

export interface Applicant {
  fullName: string;
  email: string;
  phone: string | null;
  /** Absolute path to the CV file on the worker's local disk. */
  cvFilePath: string;
  coverLetter: string | null;
  /** Delegates open questions (years of experience, notice period…) to the AI form answerer. */
  answerQuestions: AnswerQuestionsFn;
}

export type AnswerQuestionsFn = (
  questions: import("./forms").ExtractedQuestion[],
) => Promise<Array<{ questionId: string; value: string | null }>>;

export type ApplyResult =
  | { status: "submitted"; confirmation: string | null }
  | { status: "already_applied" }
  | { status: "needs_user_action"; reason: string; pendingQuestions?: string[] }
  | { status: "offer_closed" }
  | { status: "failed"; reason: string; retryable: boolean };
