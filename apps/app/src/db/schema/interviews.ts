import { index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { applications, applicationStages } from "./applications";
import { user } from "./auth";
import {
  interviewMode,
  interviewStatus,
  participantResponse,
  participantRole,
} from "./enums";
import { createdAt, tstz, updatedAt } from "./_shared";

export const interviews = pgTable(
  "interviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    /** Which stage this interview satisfies. */
    applicationStageId: uuid("application_stage_id")
      .notNull()
      .references(() => applicationStages.id, { onDelete: "cascade" }),
    title: text("title"),
    scheduledAt: tstz("scheduled_at").notNull(),
    durationMinutes: integer("duration_minutes").default(60).notNull(),
    mode: interviewMode("mode").default("video").notNull(),
    /** Room, for onsite. */
    location: text("location"),
    meetingUrl: text("meeting_url"),
    status: interviewStatus("status").default("scheduled").notNull(),
    notesForInterviewers: text("notes_for_interviewers"),
    cancelledAt: tstz("cancelled_at"),
    cancelReason: text("cancel_reason"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("interviews_application_idx").on(t.applicationId),
    index("interviews_application_stage_idx").on(t.applicationStageId),
    index("interviews_scheduled_at_idx").on(t.scheduledAt),
    index("interviews_status_scheduled_idx").on(t.status, t.scheduledAt),
  ],
);

export const interviewParticipants = pgTable(
  "interview_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interviews.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: participantRole("role").default("interviewer").notNull(),
    responseStatus: participantResponse("response_status")
      .default("pending")
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("interview_participants_unique").on(t.interviewId, t.userId),
    // This index IS the per-interviewer agenda query, and the join that scopes
    // an interviewer to only the applications they were assigned to.
    index("interview_participants_user_idx").on(t.userId),
  ],
);

export type Interview = typeof interviews.$inferSelect;
export type NewInterview = typeof interviews.$inferInsert;
export type InterviewParticipant = typeof interviewParticipants.$inferSelect;
