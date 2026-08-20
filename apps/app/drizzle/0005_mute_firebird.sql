CREATE TABLE "position_stage_interviewers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_stage_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "position_stage_interviewers" ADD CONSTRAINT "position_stage_interviewers_position_stage_id_position_stages_id_fk" FOREIGN KEY ("position_stage_id") REFERENCES "public"."position_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_stage_interviewers" ADD CONSTRAINT "position_stage_interviewers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "position_stage_interviewers_unique" ON "position_stage_interviewers" USING btree ("position_stage_id","user_id");--> statement-breakpoint
CREATE INDEX "position_stage_interviewers_user_idx" ON "position_stage_interviewers" USING btree ("user_id");