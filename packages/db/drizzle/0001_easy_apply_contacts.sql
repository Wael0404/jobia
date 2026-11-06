ALTER TYPE "public"."application_status" ADD VALUE 'user_to_apply' BEFORE 'needs_user_action';--> statement-breakpoint
CREATE TABLE "offer_contacts" (
	"job_offer_id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"source_url" text,
	"found_via" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "applied_via" "apply_channel";--> statement-breakpoint
ALTER TABLE "offer_contacts" ADD CONSTRAINT "offer_contacts_job_offer_id_job_offers_id_fk" FOREIGN KEY ("job_offer_id") REFERENCES "public"."job_offers"("id") ON DELETE cascade ON UPDATE no action;