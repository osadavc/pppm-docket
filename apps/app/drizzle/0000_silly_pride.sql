CREATE TYPE "public"."application_status" AS ENUM('active', 'hired', 'rejected', 'on_hold', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."attachment_kind" AS ENUM('cv', 'cover_letter', 'portfolio', 'job_description', 'other');--> statement-breakpoint
CREATE TYPE "public"."candidate_source" AS ENUM('careers_site', 'referral', 'agency', 'linkedin', 'other');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('full_time', 'part_time', 'contract', 'internship');--> statement-breakpoint
CREATE TYPE "public"."interview_mode" AS ENUM('onsite', 'video', 'phone');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('interview_scheduled', 'interview_rescheduled', 'interview_cancelled', 'feedback_requested', 'stage_advanced', 'decision_made', 'account_invited');--> statement-breakpoint
CREATE TYPE "public"."participant_response" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('lead', 'interviewer', 'observer');--> statement-breakpoint
CREATE TYPE "public"."position_status" AS ENUM('draft', 'open', 'on_hold', 'closed', 'filled');--> statement-breakpoint
CREATE TYPE "public"."recommendation" AS ENUM('strong_no', 'no', 'yes', 'strong_yes');--> statement-breakpoint
CREATE TYPE "public"."scorecard_status" AS ENUM('draft', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."stage_kind" AS ENUM('screening', 'interview', 'assessment', 'offer');--> statement-breakpoint
CREATE TYPE "public"."stage_progress_status" AS ENUM('pending', 'in_progress', 'passed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('hr', 'interviewer', 'management');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"role" text DEFAULT 'interviewer' NOT NULL,
	"job_title" text,
	"department" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_role_check" CHECK ("user"."role" in ('hr', 'interviewer', 'management'))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"department" text NOT NULL,
	"location" text,
	"employment_type" "employment_type" DEFAULT 'full_time' NOT NULL,
	"description" text NOT NULL,
	"requirements" text,
	"salary_min" integer,
	"salary_max" integer,
	"openings" integer DEFAULT 1 NOT NULL,
	"status" "position_status" DEFAULT 'draft' NOT NULL,
	"require_feedback_to_advance" boolean DEFAULT true NOT NULL,
	"hiring_manager_id" text,
	"created_by_id" text NOT NULL,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_template_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_stage_id" uuid NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"weight" integer DEFAULT 1 NOT NULL,
	"order_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_template_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_template_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order_index" integer NOT NULL,
	"kind" "stage_kind" DEFAULT 'interview' NOT NULL,
	"requires_scorecard" boolean DEFAULT true NOT NULL,
	"min_scorecards" integer DEFAULT 1 NOT NULL,
	"sla_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order_index" integer NOT NULL,
	"kind" "stage_kind" DEFAULT 'interview' NOT NULL,
	"requires_scorecard" boolean DEFAULT true NOT NULL,
	"min_scorecards" integer DEFAULT 1 NOT NULL,
	"sla_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scorecard_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_stage_id" uuid NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"weight" integer DEFAULT 1 NOT NULL,
	"order_index" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"location" text,
	"linkedin_url" text,
	"current_title" text,
	"current_company" text,
	"source" "candidate_source" DEFAULT 'other' NOT NULL,
	"referred_by_id" text,
	"notes" text,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"position_stage_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"status" "stage_progress_status" DEFAULT 'pending' NOT NULL,
	"entered_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"decided_by_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"current_stage_id" uuid,
	"status" "application_status" DEFAULT 'active' NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decision_at" timestamp with time zone,
	"decision_by_id" text,
	"decision_reason" text,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interview_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "participant_role" DEFAULT 'interviewer' NOT NULL,
	"response_status" "participant_response" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"application_stage_id" uuid NOT NULL,
	"title" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"mode" "interview_mode" DEFAULT 'video' NOT NULL,
	"location" text,
	"meeting_url" text,
	"status" "interview_status" DEFAULT 'scheduled' NOT NULL,
	"notes_for_interviewers" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scorecard_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scorecard_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scorecard_ratings_range_check" CHECK ("scorecard_ratings"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "scorecards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"application_stage_id" uuid NOT NULL,
	"interview_id" uuid,
	"author_id" text NOT NULL,
	"status" "scorecard_status" DEFAULT 'draft' NOT NULL,
	"recommendation" "recommendation",
	"overall_score" numeric(4, 2),
	"strengths" text,
	"concerns" text,
	"notes" text,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "attachment_kind" DEFAULT 'cv' NOT NULL,
	"candidate_id" uuid,
	"application_id" uuid,
	"position_id" uuid,
	"bucket" text DEFAULT 'candidate-files' NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_storage_path_unique" UNIQUE("storage_path"),
	CONSTRAINT "attachments_owner_check" CHECK ("attachments"."candidate_id" is not null or "attachments"."application_id" is not null or "attachments"."position_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"application_id" uuid,
	"position_id" uuid,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "notification_type" NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_user_id" text,
	"recipient_candidate_id" uuid,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"interview_id" uuid,
	"application_id" uuid,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_hiring_manager_id_user_id_fk" FOREIGN KEY ("hiring_manager_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_template_criteria" ADD CONSTRAINT "stage_template_criteria_template_stage_id_stage_template_stages_id_fk" FOREIGN KEY ("template_stage_id") REFERENCES "public"."stage_template_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_template_sets" ADD CONSTRAINT "stage_template_sets_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_template_stages" ADD CONSTRAINT "stage_template_stages_set_id_stage_template_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."stage_template_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_stages" ADD CONSTRAINT "position_stages_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_criteria" ADD CONSTRAINT "scorecard_criteria_position_stage_id_position_stages_id_fk" FOREIGN KEY ("position_stage_id") REFERENCES "public"."position_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_referred_by_id_user_id_fk" FOREIGN KEY ("referred_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stages" ADD CONSTRAINT "application_stages_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stages" ADD CONSTRAINT "application_stages_position_stage_id_position_stages_id_fk" FOREIGN KEY ("position_stage_id") REFERENCES "public"."position_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stages" ADD CONSTRAINT "application_stages_decided_by_id_user_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_current_stage_id_position_stages_id_fk" FOREIGN KEY ("current_stage_id") REFERENCES "public"."position_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_decision_by_id_user_id_fk" FOREIGN KEY ("decision_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_participants" ADD CONSTRAINT "interview_participants_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_participants" ADD CONSTRAINT "interview_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_stage_id_application_stages_id_fk" FOREIGN KEY ("application_stage_id") REFERENCES "public"."application_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_ratings" ADD CONSTRAINT "scorecard_ratings_scorecard_id_scorecards_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."scorecards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_ratings" ADD CONSTRAINT "scorecard_ratings_criterion_id_scorecard_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."scorecard_criteria"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_application_stage_id_application_stages_id_fk" FOREIGN KEY ("application_stage_id") REFERENCES "public"."application_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_candidate_id_candidates_id_fk" FOREIGN KEY ("recipient_candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_role_idx" ON "user" USING btree ("role");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "positions_status_idx" ON "positions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "positions_department_idx" ON "positions" USING btree ("department");--> statement-breakpoint
CREATE INDEX "positions_hiring_manager_idx" ON "positions" USING btree ("hiring_manager_id");--> statement-breakpoint
CREATE INDEX "stage_template_criteria_stage_idx" ON "stage_template_criteria" USING btree ("template_stage_id");--> statement-breakpoint
CREATE INDEX "stage_template_stages_set_order_idx" ON "stage_template_stages" USING btree ("set_id","order_index");--> statement-breakpoint
CREATE INDEX "position_stages_position_order_idx" ON "position_stages" USING btree ("position_id","order_index");--> statement-breakpoint
CREATE INDEX "scorecard_criteria_stage_idx" ON "scorecard_criteria" USING btree ("position_stage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_email_unique" ON "candidates" USING btree ("email");--> statement-breakpoint
CREATE INDEX "candidates_full_name_idx" ON "candidates" USING btree ("full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "application_stages_app_stage_unique" ON "application_stages" USING btree ("application_id","position_stage_id");--> statement-breakpoint
CREATE INDEX "application_stages_app_order_idx" ON "application_stages" USING btree ("application_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_candidate_position_unique" ON "applications" USING btree ("candidate_id","position_id");--> statement-breakpoint
CREATE INDEX "applications_position_status_idx" ON "applications" USING btree ("position_id","status");--> statement-breakpoint
CREATE INDEX "applications_current_stage_idx" ON "applications" USING btree ("current_stage_id");--> statement-breakpoint
CREATE INDEX "applications_candidate_idx" ON "applications" USING btree ("candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_participants_unique" ON "interview_participants" USING btree ("interview_id","user_id");--> statement-breakpoint
CREATE INDEX "interview_participants_user_idx" ON "interview_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "interviews_application_idx" ON "interviews" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "interviews_application_stage_idx" ON "interviews" USING btree ("application_stage_id");--> statement-breakpoint
CREATE INDEX "interviews_scheduled_at_idx" ON "interviews" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "interviews_status_scheduled_idx" ON "interviews" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scorecard_ratings_unique" ON "scorecard_ratings" USING btree ("scorecard_id","criterion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scorecards_stage_author_unique" ON "scorecards" USING btree ("application_stage_id","author_id");--> statement-breakpoint
CREATE INDEX "scorecards_application_idx" ON "scorecards" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "scorecards_author_status_idx" ON "scorecards" USING btree ("author_id","status");--> statement-breakpoint
CREATE INDEX "attachments_candidate_idx" ON "attachments" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "attachments_application_idx" ON "attachments" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "attachments_position_idx" ON "attachments" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "activity_log_application_idx" ON "activity_log" USING btree ("application_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "activity_log_position_idx" ON "activity_log" USING btree ("position_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "activity_log_entity_idx" ON "activity_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "activity_log_created_idx" ON "activity_log" USING btree ("created_at" desc);--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notifications_recipient_user_idx" ON "notifications" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "notifications_application_idx" ON "notifications" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at" desc);