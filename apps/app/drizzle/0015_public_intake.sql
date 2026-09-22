-- Public intake: a candidate who applies from the careers site has no staff
-- creator, and their CV has no staff uploader.
ALTER TABLE "candidates" ALTER COLUMN "created_by_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ALTER COLUMN "created_by_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "uploaded_by_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "salary_expectation" text;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_salary_expectation_length" CHECK ("applications"."salary_expectation" IS NULL OR char_length("applications"."salary_expectation") <= 60);--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"hits" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL
);
