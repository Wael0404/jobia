CREATE TYPE "public"."agent_mode" AS ENUM('autopilot', 'review', 'paused');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('pending_review', 'queued', 'submitting', 'submitted', 'viewed', 'interview', 'offer', 'rejected', 'withdrawn', 'needs_user_action', 'failed');--> statement-breakpoint
CREATE TYPE "public"."apply_channel" AS ENUM('site_form', 'easy_apply', 'email');--> statement-breakpoint
CREATE TYPE "public"."cv_status" AS ENUM('pending_upload', 'parsing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."event_actor" AS ENUM('agent', 'user', 'employer', 'system');--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('google', 'linkedin', 'tanitjobs', 'keejob', 'emploitunisie');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('connected', 'needs_reauth', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."job_source" AS ENUM('linkedin', 'tanitjobs', 'keejob', 'emploitunisie', 'email');--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"actor" "event_actor" NOT NULL,
	"from_status" "application_status",
	"to_status" "application_status",
	"message" text NOT NULL,
	"payload" jsonb,
	"dedupe_key" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_offer_id" uuid NOT NULL,
	"cv_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'queued' NOT NULL,
	"match_score" integer NOT NULL,
	"match_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cover_letter" text,
	"email_thread_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"pending_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cvs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" "cv_status" DEFAULT 'pending_upload' NOT NULL,
	"profile" jsonb,
	"is_active" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"status" "integration_status" DEFAULT 'connected' NOT NULL,
	"external_account_id" text,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"encrypted_secret" text,
	"encrypted_session" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"location" text,
	"meeting_url" text,
	"notes" text,
	"source_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "job_source" NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"location" text,
	"description" text DEFAULT '' NOT NULL,
	"apply_channel" "apply_channel" NOT NULL,
	"apply_email" text,
	"posted_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"agent_mode" "agent_mode" DEFAULT 'review' NOT NULL,
	"preferences" jsonb,
	"saved_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"gmail_history_id" text,
	"last_discovery_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_offer_id_job_offers_id_fk" FOREIGN KEY ("job_offer_id") REFERENCES "public"."job_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_cv_id_cvs_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."cvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cvs" ADD CONSTRAINT "cvs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_events_app_idx" ON "application_events" USING btree ("application_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "application_events_dedupe_uq" ON "application_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_user_offer_uq" ON "applications" USING btree ("user_id","job_offer_id");--> statement-breakpoint
CREATE INDEX "applications_user_status_idx" ON "applications" USING btree ("user_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "applications_thread_idx" ON "applications" USING btree ("email_thread_id");--> statement-breakpoint
CREATE INDEX "cvs_user_idx" ON "cvs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_user_provider_uq" ON "integrations" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "interviews_user_time_idx" ON "interviews" USING btree ("user_id","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "interviews_source_message_uq" ON "interviews" USING btree ("source_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_offers_source_external_uq" ON "job_offers" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "job_offers_posted_idx" ON "job_offers" USING btree ("posted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_uq" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_sub_uq" ON "users" USING btree ("google_sub");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");