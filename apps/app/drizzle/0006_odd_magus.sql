ALTER TABLE "position_stages" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "position_stages" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "position_stages_archived_idx" ON "position_stages" USING btree ("position_id","is_archived");