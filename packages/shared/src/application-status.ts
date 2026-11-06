import type { ApplicationStatus } from "./domain";

/**
 * Explicit state machine for an application. Any status change must go
 * through `canTransition` so that late or duplicated events (e.g. a Gmail
 * message processed twice) can never move an application backwards.
 */
const TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  pending_review: ["queued", "withdrawn"],
  queued: ["submitting", "withdrawn", "needs_user_action"],
  submitting: ["submitted", "failed", "needs_user_action", "queued", "user_to_apply"],
  user_to_apply: ["submitted", "withdrawn"],
  needs_user_action: ["queued", "withdrawn", "submitted"],
  submitted: ["viewed", "interview", "rejected", "offer", "withdrawn"],
  viewed: ["interview", "rejected", "offer", "withdrawn"],
  interview: ["interview", "offer", "rejected", "withdrawn"],
  offer: ["withdrawn"],
  rejected: [],
  withdrawn: [],
  failed: ["queued"],
};

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export const TERMINAL_STATUSES: readonly ApplicationStatus[] = ["rejected", "withdrawn", "offer", "failed"];
