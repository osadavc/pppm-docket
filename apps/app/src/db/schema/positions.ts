import { index, integer, pgTable, text, uuid, boolean } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { employmentType, positionStatus, reviewDecision } from "./enums";
import { createdAt, tstz, updatedAt } from "./_shared";

export const positions = pgTable(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    department: text("department").notNull(),
    location: text("location"),
    employmentType: employmentType("employment_type").default("full_time").notNull(),
    /** The job description, stored as markdown. */
    description: text("description").notNull(),
    requirements: text("requirements"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    openings: integer("openings").default(1).notNull(),
    /** Optional while drafting; a position can be prepared before a date is fixed. */
    applicationDeadline: tstz("application_deadline"),
    status: positionStatus("status").default("draft").notNull(),
    /**
     * Position-level master switch for the feedback gate. Individual stages can
     * still opt out via `positionStages.requiresScorecard`.
     */
    requireFeedbackToAdvance: boolean("require_feedback_to_advance")
      .default(true)
      .notNull(),
    hiringManagerId: text("hiring_manager_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    /** Who put this forward for approval, and when. */
    submittedById: text("submitted_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    submittedAt: tstz("submitted_at"),
    /**
     * The last management decision. Kept even after a rejection sends the
     * position back to draft — otherwise a rejected role is indistinguishable
     * from one that was never submitted, and HR never sees why it came back.
     */
    lastReviewDecision: reviewDecision("last_review_decision"),
    reviewedById: text("reviewed_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: tstz("reviewed_at"),
    /** The manager’s note. Required when rejecting, optional when approving. */
    reviewNote: text("review_note"),
    /** Set on the draft -> open transition; drives the ageing report. */
    openedAt: tstz("opened_at"),
    closedAt: tstz("closed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("positions_status_idx").on(t.status),
    index("positions_department_idx").on(t.department),
    index("positions_hiring_manager_idx").on(t.hiringManagerId),
    index("positions_deadline_idx").on(t.applicationDeadline),
  ],
);

export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
