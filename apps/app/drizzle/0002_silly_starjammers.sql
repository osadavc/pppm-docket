ALTER TYPE "public"."position_status" ADD VALUE 'pending_approval' BEFORE 'open';--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "submitted_by_id" text;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_submitted_by_id_user_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;