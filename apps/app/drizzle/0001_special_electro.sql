ALTER TABLE "positions" ADD COLUMN "application_deadline" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "positions_deadline_idx" ON "positions" USING btree ("application_deadline");