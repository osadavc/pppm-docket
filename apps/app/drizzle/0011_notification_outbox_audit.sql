ALTER TYPE "public"."notification_status" ADD VALUE 'dispatching' BEFORE 'sent';--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "initiated_by_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
-- Existing terminal rows represent one historical dispatch attempt. Rows that
-- have never left the queue correctly retain attempt_count = 0.
UPDATE "notifications"
SET
	"attempt_count" = 1,
	"last_attempt_at" = COALESCE("sent_at", "updated_at")
WHERE "status" IN ('sent', 'failed');--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_initiated_by_id_user_id_fk" FOREIGN KEY ("initiated_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_initiated_by_idx" ON "notifications" USING btree ("initiated_by_id");--> statement-breakpoint
CREATE INDEX "notifications_provider_message_idx" ON "notifications" USING btree ("provider_message_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_attempt_count_check" CHECK ("notifications"."attempt_count" >= 0);
