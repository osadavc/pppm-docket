import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Postgres enums are painful to change under `drizzle-kit push` (it may want to
 * drop and recreate the type, taking columns with it), so this list is
 * deliberately settled up front. Adding a value later needs a hand-written
 * `ALTER TYPE ... ADD VALUE` migration.
 */

export const userRole = pgEnum("user_role", ["hr", "interviewer", "management"]);

export const employmentType = pgEnum("employment_type", [
  "full_time",
  "part_time",
  "contract",
  "internship",
]);

export const positionStatus = pgEnum("position_status", [
  "draft",
  // Awaiting management sign-off. A position cannot reach "open" without
  // passing through here — see lib/domain/position-status.ts.
  "pending_approval",
  "open",
  "on_hold",
  "closed",
  "filled",
  // Abandoned before hiring anyone — distinct from "closed", which ended
  // normally. Keeping them apart is what stops cancelled roles polluting
  // time-to-fill.
  "cancelled",
]);

/** Outcome of the last management review of a position. */
export const reviewDecision = pgEnum("review_decision", ["approved", "rejected"]);

export const stageKind = pgEnum("stage_kind", [
  "screening",
  "interview",
  "assessment",
  "offer",
]);

export const applicationStatus = pgEnum("application_status", [
  "active",
  "hired",
  "rejected",
  "on_hold",
  "withdrawn",
]);

export const stageProgressStatus = pgEnum("stage_progress_status", [
  "pending",
  "in_progress",
  "passed",
  "failed",
  "skipped",
]);

export const candidateSource = pgEnum("candidate_source", [
  "careers_site",
  "referral",
  "agency",
  "linkedin",
  "other",
]);

export const interviewMode = pgEnum("interview_mode", ["onsite", "video", "phone"]);

export const interviewStatus = pgEnum("interview_status", [
  "scheduled",
  "completed",
  "cancelled",
  "no_show",
]);

export const participantRole = pgEnum("participant_role", [
  "lead",
  "interviewer",
  "observer",
]);

export const participantResponse = pgEnum("participant_response", [
  "pending",
  "accepted",
  "declined",
]);

export const scorecardStatus = pgEnum("scorecard_status", ["draft", "submitted"]);

/** Four points, no middle option — "maybe" is what spreadsheets already produce. */
export const recommendation = pgEnum("recommendation", [
  "strong_no",
  "no",
  "yes",
  "strong_yes",
]);

export const attachmentKind = pgEnum("attachment_kind", [
  "cv",
  "cover_letter",
  "portfolio",
  "job_description",
  "other",
]);

export const notificationType = pgEnum("notification_type", [
  "interview_scheduled",
  "interview_rescheduled",
  "interview_cancelled",
  "feedback_requested",
  "stage_advanced",
  "decision_made",
  "account_invited",
]);

export const notificationStatus = pgEnum("notification_status", [
  "queued",
  "sent",
  "failed",
]);

export type UserRole = (typeof userRole.enumValues)[number];
export type PositionStatus = (typeof positionStatus.enumValues)[number];
export type ReviewDecision = (typeof reviewDecision.enumValues)[number];
export type ApplicationStatus = (typeof applicationStatus.enumValues)[number];
export type StageProgressStatus = (typeof stageProgressStatus.enumValues)[number];
export type Recommendation = (typeof recommendation.enumValues)[number];
export type InterviewMode = (typeof interviewMode.enumValues)[number];
