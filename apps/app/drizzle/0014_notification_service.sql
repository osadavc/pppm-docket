-- Enum values are recreated rather than appended: ADD VALUE cannot be used in
-- the transaction that created it, and the legacy "demo" status is retired in
-- favour of "simulated" in the same step.
ALTER TYPE "public"."notification_type" RENAME TO "notification_type_old";--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('interview_scheduled', 'interview_rescheduled', 'interview_cancelled', 'feedback_requested', 'stage_advanced', 'decision_made', 'account_invited', 'application_received', 'rejection', 'custom');--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "public"."notification_type" USING (
  CASE
    -- Candidate mail announcing a decision was always the rejection template.
    WHEN "type"::text = 'decision_made' AND "recipient_candidate_id" IS NOT NULL THEN 'rejection'
    ELSE "type"::text
  END
)::"public"."notification_type";--> statement-breakpoint
DROP TYPE "public"."notification_type_old";--> statement-breakpoint
ALTER TYPE "public"."notification_status" RENAME TO "notification_status_old";--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'dispatching', 'sent', 'failed', 'simulated');--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "status" TYPE "public"."notification_status" USING (
  CASE WHEN "status"::text = 'demo' THEN 'simulated' ELSE "status"::text END
)::"public"."notification_status";--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "status" SET DEFAULT 'queued';--> statement-breakpoint
DROP TYPE "public"."notification_status_old";--> statement-breakpoint
-- The approving user is an audit fact, not an ownership link: deleting the
-- account must not take the record of what was sent with it.
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_initiated_by_id_user_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "notifications_initiated_by_idx";--> statement-breakpoint
ALTER TABLE "notifications" RENAME COLUMN "initiated_by_id" TO "actor_id";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_actor_idx" ON "notifications" USING btree ("actor_id");--> statement-breakpoint
-- Rows that were "demo" carry the facts the simulated status now records.
UPDATE "notifications"
SET "metadata" = jsonb_build_object(
  'idempotencyKey', 'notification/' || "id"::text,
  'originalRecipient', "recipient_email",
  'redirected', ("delivery_email" IS NOT NULL AND "delivery_email" <> "recipient_email")
)
WHERE "status" = 'simulated' AND "metadata" IS NULL;
