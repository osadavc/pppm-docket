import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { stageKind } from "./enums";
import { positions } from "./positions";
import { createdAt, updatedAt } from "./_shared";

/**
 * The per-position pipeline instance. Once a position owns its stages it can be
 * edited freely; deletion is blocked in the action layer once any application
 * exists, because deleting a stage would orphan submitted feedback.
 */
export const positionStages = pgTable(
  "position_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    positionId: uuid("position_id")
      .notNull()
      .references(() => positions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Stage guidance shown to interviewers. */
    description: text("description"),
    orderIndex: integer("order_index").notNull(),
    kind: stageKind("kind").default("interview").notNull(),
    /** Part of the advancement gate — see lib/domain/advancement.ts. */
    requiresScorecard: boolean("requires_scorecard").default(true).notNull(),
    minScorecards: integer("min_scorecards").default(1).notNull(),
    /** Target days-in-stage, compared against actuals in the time-in-stage report. */
    slaDays: integer("sla_days"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // Deliberately NOT unique on (positionId, orderIndex): a reorder rewrites
  // every row's index and a unique constraint would fail mid-statement.
  (t) => [index("position_stages_position_order_idx").on(t.positionId, t.orderIndex)],
);

export const scorecardCriteria = pgTable(
  "scorecard_criteria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Criteria are scoped to a STAGE, not a position: "System Design" belongs to
     * the tech round, "Culture & Values" to the final round. Fair comparison
     * means every candidate at the same stage is scored on the same axes.
     */
    positionStageId: uuid("position_stage_id")
      .notNull()
      .references(() => positionStages.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    description: text("description"),
    weight: integer("weight").default(1).notNull(),
    orderIndex: integer("order_index").notNull(),
    /** Soft-delete: removing a rated criterion would destroy submitted feedback. */
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("scorecard_criteria_stage_idx").on(t.positionStageId)],
);

export type PositionStage = typeof positionStages.$inferSelect;
export type ScorecardCriterion = typeof scorecardCriteria.$inferSelect;

/**
 * The standing interview panel for a stage.
 *
 * Distinct from `interview_participants`, which records who actually attended a
 * particular scheduled interview. This is the *responsibility*: who is expected
 * to assess every candidate who reaches this stage of this position. It is what
 * makes accountability explicit before anyone is scheduled, and it drives both
 * an interviewer's visibility of candidates and the feedback gate.
 */
export const positionStageInterviewers = pgTable(
  "position_stage_interviewers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    positionStageId: uuid("position_stage_id")
      .notNull()
      .references(() => positionStages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("position_stage_interviewers_unique").on(t.positionStageId, t.userId),
    // This index is the visibility query: "which candidates may this person see?"
    index("position_stage_interviewers_user_idx").on(t.userId),
  ],
);

export type PositionStageInterviewer = typeof positionStageInterviewers.$inferSelect;
