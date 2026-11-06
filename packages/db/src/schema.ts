import type { CandidateProfile, JobPreferences } from "@jobia/shared";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  AGENT_MODES,
  APPLICATION_STATUSES,
  APPLY_CHANNELS,
  INTEGRATION_STATUSES,
  JOB_SOURCES,
  PLAN_IDS,
} from "@jobia/shared";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const agentModeEnum = pgEnum("agent_mode", AGENT_MODES);
export const planEnum = pgEnum("plan", PLAN_IDS);
export const applicationStatusEnum = pgEnum("application_status", APPLICATION_STATUSES);
export const applyChannelEnum = pgEnum("apply_channel", APPLY_CHANNELS);
export const jobSourceEnum = pgEnum("job_source", JOB_SOURCES);
export const integrationStatusEnum = pgEnum("integration_status", INTEGRATION_STATUSES);
export const integrationProviderEnum = pgEnum("integration_provider", [
  "google",
  "linkedin",
  "tanitjobs",
  "keejob",
  "emploitunisie",
]);
export const cvStatusEnum = pgEnum("cv_status", ["pending_upload", "parsing", "ready", "failed"]);
export const eventActorEnum = pgEnum("event_actor", ["agent", "user", "employer", "system"]);

/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    googleSub: text("google_sub").notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    agentMode: agentModeEnum("agent_mode").notNull().default("review"),
    plan: planEnum("plan").notNull().default("free"),
    /** Set when the user picks a plan (onboarding is done); null = must choose a plan first. */
    planSelectedAt: timestamp("plan_selected_at", { withTimezone: true }),
    preferences: jsonb("preferences").$type<JobPreferences>(),
    /** Answers to recurring form questions ("notice period", "expected salary"…), provided by the user. */
    savedAnswers: jsonb("saved_answers").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    /** Gmail incremental sync cursor. */
    gmailHistoryId: text("gmail_history_id"),
    lastDiscoveryAt: timestamp("last_discovery_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_google_sub_uq").on(t.googleSub), uniqueIndex("users_email_uq").on(t.email)],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    /** All tokens issued from one login share a family; reuse of a rotated token revokes the family. */
    familyId: uuid("family_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("refresh_tokens_hash_uq").on(t.tokenHash), index("refresh_tokens_family_idx").on(t.familyId)],
);

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    status: integrationStatusEnum("status").notNull().default("connected"),
    externalAccountId: text("external_account_id"),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    /** Vault-encrypted secret (OAuth refresh token or site password). Never returned by the API. */
    encryptedSecret: text("encrypted_secret"),
    /** Vault-encrypted Playwright storageState, reused to avoid logging in on every run. */
    encryptedSession: text("encrypted_session"),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [uniqueIndex("integrations_user_provider_uq").on(t.userId, t.provider)],
);

export const cvs = pgTable(
  "cvs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    status: cvStatusEnum("status").notNull().default("pending_upload"),
    profile: jsonb("profile").$type<CandidateProfile>(),
    isActive: boolean("is_active").notNull().default(false),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index("cvs_user_idx").on(t.userId, t.createdAt)],
);

/**
 * Offers are global (shared by all users): one LinkedIn offer discovered
 * by 5 000 users is stored once, which keeps the table small at scale.
 */
export const jobOffers = pgTable(
  "job_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: jobSourceEnum("source").notNull(),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    company: text("company").notNull(),
    location: text("location"),
    description: text("description").notNull().default(""),
    applyChannel: applyChannelEnum("apply_channel").notNull(),
    applyEmail: text("apply_email"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    raw: jsonb("raw"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("job_offers_source_external_uq").on(t.source, t.externalId),
    index("job_offers_posted_idx").on(t.postedAt),
  ],
);

/**
 * Hot table. Every query is scoped by user_id, so it can be partitioned by
 * HASH(user_id) when it grows (plan in docs/ARCHITECTURE.md §Database).
 */
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobOfferId: uuid("job_offer_id")
      .notNull()
      .references(() => jobOffers.id),
    cvId: uuid("cv_id")
      .notNull()
      .references(() => cvs.id),
    status: applicationStatusEnum("status").notNull().default("queued"),
    matchScore: integer("match_score").notNull(),
    matchReasons: jsonb("match_reasons").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    coverLetter: text("cover_letter"),
    /** Gmail thread used when the application was sent by email, to correlate replies. */
    emailThreadId: text("email_thread_id"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    /** Required questions the agent could not answer; shown to the user. */
    pendingQuestions: jsonb("pending_questions").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("applications_user_offer_uq").on(t.userId, t.jobOfferId),
    index("applications_user_status_idx").on(t.userId, t.status, t.updatedAt),
    index("applications_thread_idx").on(t.emailThreadId),
  ],
);

/** Append-only audit trail: powers the per-application timeline and the reports. */
export const applicationEvents = pgTable(
  "application_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    actor: eventActorEnum("actor").notNull(),
    fromStatus: applicationStatusEnum("from_status"),
    toStatus: applicationStatusEnum("to_status"),
    message: text("message").notNull(),
    payload: jsonb("payload"),
    /** Idempotency key (e.g. Gmail message id) so replays never duplicate events. */
    dedupeKey: text("dedupe_key"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("application_events_app_idx").on(t.applicationId, t.occurredAt),
    uniqueIndex("application_events_dedupe_uq").on(t.dedupeKey),
  ],
);

export const interviews = pgTable(
  "interviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    location: text("location"),
    meetingUrl: text("meeting_url"),
    notes: text("notes"),
    sourceMessageId: text("source_message_id"),
    ...timestamps,
  },
  (t) => [
    index("interviews_user_time_idx").on(t.userId, t.scheduledAt),
    uniqueIndex("interviews_source_message_uq").on(t.sourceMessageId),
  ],
);

/* ------------------------------------------------------------------ */

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  jobOffer: one(jobOffers, { fields: [applications.jobOfferId], references: [jobOffers.id] }),
  events: many(applicationEvents),
}));

export const applicationEventsRelations = relations(applicationEvents, ({ one }) => ({
  application: one(applications, { fields: [applicationEvents.applicationId], references: [applications.id] }),
}));

export type User = typeof users.$inferSelect;
export type Integration = typeof integrations.$inferSelect;
export type IntegrationProvider = (typeof integrationProviderEnum.enumValues)[number];
export type Cv = typeof cvs.$inferSelect;
export type JobOffer = typeof jobOffers.$inferSelect;
export type NewJobOffer = typeof jobOffers.$inferInsert;
export type Application = typeof applications.$inferSelect;
