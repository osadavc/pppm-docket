CREATE TYPE "public"."rejection_reason" AS ENUM('insufficient_experience', 'skills_mismatch', 'failed_assessment', 'communication_concerns', 'values_mismatch', 'salary_expectations', 'right_to_work_or_location', 'stronger_candidate_selected', 'position_closed', 'other');--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "rejection_reason" "rejection_reason";--> statement-breakpoint
CREATE INDEX "applications_rejection_reason_idx" ON "applications" USING btree ("position_id","rejection_reason");--> statement-breakpoint
-- A rejection without a reason must be impossible, not merely discouraged.
--
-- Enforced in the database rather than only in the action, so no future code
-- path, script or manual fix can create a rejected application that drop-out
-- analysis cannot account for.
ALTER TABLE "applications"
  ADD CONSTRAINT "applications_rejection_reason_required"
  CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL);
