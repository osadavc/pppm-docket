import { index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { candidates } from "./candidates";
import { applicationStatus, stageProgressStatus } from "./enums";
import { positionStages } from "./pipeline";
import { positions } from "./positions";
import { createdAt, tstz, updatedAt } from "./_shared";

/** The workflow object: one candidate's journey through one position. */
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    positionId: uuid("position_id")
      .notNull()
      .references(() => positions.id, { onDelete: "cascade" }),
    /** Denormalized pointer so the pipeline board is a single cheap query. */
    currentStageId: uuid("current_stage_id").references(() => positionStages.id, {
      onDelete: "set null",
    }),
    status: applicationStatus("status").default("active").notNull(),
    appliedAt: tstz("applied_at").defaultNow().notNull(),
    decisionAt: tstz("decision_at"),
    decisionById: text("decision_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Rejection / hold / hire note. */
    decisionReason: text("decision_reason"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // The same person can never be added to the same role twice.
    uniqueIndex("applications_candidate_position_unique").on(
      t.candidateId,
      t.positionId,
    ),
    index("applications_position_status_idx").on(t.positionId, t.status),
    index("applications_current_stage_idx").on(t.currentStageId),
    index("applications_candidate_idx").on(t.candidateId),
  ],
);

/**
 * Materialized per-application progress: rows for ALL of the position's stages
 * are inserted when the application is created. This makes the two hardest
 * queries trivial — "is this stage's feedback in?" and "how long did each
 * candidate sit in each stage?" — and gives scorecards and interviews a stable
 * FK target.
 */
export const applicationStages = pgTable(
  "application_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    positionStageId: uuid("position_stage_id")
      .notNull()
      .references(() => positionStages.id, { onDelete: "cascade" }),
    /** Copied at creation so ordering survives later pipeline edits. */
    orderIndex: integer("order_index").notNull(),
    status: stageProgressStatus("status").default("pending").notNull(),
    enteredAt: tstz("entered_at"),
    completedAt: tstz("completed_at"),
    decidedById: text("decided_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /** HR's advance / reject note for this stage. */
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("application_stages_app_stage_unique").on(
      t.applicationId,
      t.positionStageId,
    ),
    index("application_stages_app_order_idx").on(t.applicationId, t.orderIndex),
  ],
);

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type ApplicationStage = typeof applicationStages.$inferSelect;
