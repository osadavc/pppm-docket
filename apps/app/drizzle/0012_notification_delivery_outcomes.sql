ALTER TYPE "public"."notification_status" ADD VALUE 'demo' BEFORE 'sent';--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "delivery_email" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "provider_result" jsonb;