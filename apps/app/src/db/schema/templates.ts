import { boolean, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { stageKind } from "./enums";
import { createdAt, updatedAt } from "./_shared";

/**
 * A reusable library HR maintains. Templates are COPIED into `positionStages`
 * at position creation — editing a template never rewrites the pipeline of a
 * live position, so in-flight candidates and past reports stay valid.
 */
export const stageTemplateSets = pgTable("stage_template_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").default(false).notNull(),
  createdById: text("created_by_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const stageTemplateStages = pgTable(
  "stage_template_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    setId: uuid("set_id")
      .notNull()
      .references(() => stageTemplateSets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    orderIndex: integer("order_index").notNull(),
    kind: stageKind("kind").default("interview").notNull(),
    requiresScorecard: boolean("requires_scorecard").default(true).notNull(),
    minScorecards: integer("min_scorecards").default(1).notNull(),
    slaDays: integer("sla_days"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("stage_template_stages_set_order_idx").on(t.setId, t.orderIndex)],
);

export const stageTemplateCriteria = pgTable(
  "stage_template_criteria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateStageId: uuid("template_stage_id")
      .notNull()
      .references(() => stageTemplateStages.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Rubric text shown to interviewers — reduces rater drift. */
    description: text("description"),
    weight: integer("weight").default(1).notNull(),
    orderIndex: integer("order_index").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("stage_template_criteria_stage_idx").on(t.templateStageId)],
);

export type StageTemplateSet = typeof stageTemplateSets.$inferSelect;
export type StageTemplateStage = typeof stageTemplateStages.$inferSelect;
export type StageTemplateCriterion = typeof stageTemplateCriteria.$inferSelect;
