/**
 * Core domain vocabulary shared by every app (API, workers, web, mobile).
 * Keep this file free of runtime dependencies other than plain constants.
 */

export const JOB_SOURCES = ["linkedin", "tanitjobs", "keejob", "emploitunisie", "email"] as const;
export type JobSourceId = (typeof JOB_SOURCES)[number];

/**
 * Boards whose public search pages can be read without a login or a browser
 * (robots.txt allows it, no anti-bot challenge). Used by the dashboard's
 * "start search" button. Keep in sync with PUBLIC_BOARDS in @jobia/connectors.
 */
export const PUBLIC_SEARCH_SOURCES = ["tanitjobs", "keejob"] as const satisfies readonly JobSourceId[];

/** How an application is physically delivered to the employer. */
export const APPLY_CHANNELS = ["site_form", "easy_apply", "email"] as const;
export type ApplyChannel = (typeof APPLY_CHANNELS)[number];

export const APPLICATION_STATUSES = [
  "pending_review", // review mode: waiting for the user's approval
  "queued", // matched and waiting for the submit worker
  "submitting", // a worker is currently applying
  "submitted", // successfully delivered to the employer
  "viewed", // employer opened / viewed the application
  "interview", // an interview was scheduled
  "offer", // the candidate received an offer
  "rejected", // employer declined
  "withdrawn", // the user cancelled it
  "needs_user_action", // captcha, 2FA, custom question we cannot answer…
  "failed", // permanent technical failure after retries
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const INTEGRATION_STATUSES = ["connected", "needs_reauth", "disabled"] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

/** Autopilot = apply automatically. Review = agent proposes, user approves each application. */
export const AGENT_MODES = ["autopilot", "review", "paused"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];
