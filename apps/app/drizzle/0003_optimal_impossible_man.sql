CREATE TYPE "public"."review_decision" AS ENUM('approved', 'rejected');--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "last_review_decision" "review_decision";--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "reviewed_by_id" text;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;