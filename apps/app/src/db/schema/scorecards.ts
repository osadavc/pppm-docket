import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { applications, applicationStages } from "./applications";
import { user } from "./auth";
import { recommendation, scorecardStatus } from "./enums";
import { interviews } from "./interviews";
import { scorecardCriteria } from "./pipeline";
import { createdAt, tstz, updatedAt } from "./_shared";

export const scorecards = pgTable(
  "scorecards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Denormalized for the application timeline query. */
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    applicationStageId: uuid("application_stage_id")
      .notNull()
      .references(() => applicationStages.id, { onDelete: "cascade" }),
    /** Nullable: screening feedback needs no scheduled interview. */
    interviewId: uuid("interview_id").references(() => interviews.id, {
      onDelete: "set null",
    }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: scorecardStatus("status").default("draft").notNull(),
    /** NULL while draft; required to submit. */
    recommendation: recommendation("recommendation"),
    /**
     * Weighted mean, computed and frozen at submit time so sorting and reports
     * do not recompute joins, and later criterion-weight edits do not silently
     * rewrite history.
     */
    overallScore: numeric("overall_score", { precision: 4, scale: 2 }),
    strengths: text("strengths"),
    concerns: text("concerns"),
    notes: text("notes"),
    submittedAt: tstz("submitted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One scorecard per interviewer per stage.
    uniqueIndex("scorecards_stage_author_unique").on(
      t.applicationStageId,
      t.authorId,
    ),
    index("scorecards_application_idx").on(t.applicationId),
    // Drives "my outstanding feedback" on the agenda.
    index("scorecards_author_status_idx").on(t.authorId, t.status),
  ],
);

export const scorecardRatings = pgTable(
  "scorecard_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scorecardId: uuid("scorecard_id")
      .notNull()
      .references(() => scorecards.id, { onDelete: "cascade" }),
    criterionId: uuid("criterion_id")
      .notNull()
      .references(() => scorecardCriteria.id, { onDelete: "restrict" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("scorecard_ratings_unique").on(t.scorecardId, t.criterionId),
    check("scorecard_ratings_range_check", sql`${t.rating} between 1 and 5`),
  ],
);

export type Scorecard = typeof scorecards.$inferSelect;
export type NewScorecard = typeof scorecards.$inferInsert;
export type ScorecardRating = typeof scorecardRatings.$inferSelect;
