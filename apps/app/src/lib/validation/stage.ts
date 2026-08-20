import { z } from "zod";

const stageFields = {
  name: z
    .string()
    .trim()
    .min(2, "Stage name must be at least 2 characters")
    .max(120, "Stage name is too long"),
  description: z.string().trim().max(2000).optional(),
  kind: z.enum(["screening", "interview", "assessment", "offer"]),
  requiresScorecard: z.boolean(),
  minScorecards: z
    .number({ message: "Enter how many scorecards are needed" })
    .int()
    .min(0, "Cannot be negative")
    .max(10, "That is an unlikely number of interviewers"),
  slaDays: z
    .union([z.number().int().min(1).max(365), z.literal("")])
    .optional(),
};

export const createStageSchema = z.object({
  positionId: z.uuid(),
  ...stageFields,
});

export const updateStageSchema = z.object({
  stageId: z.uuid(),
  ...stageFields,
});

export const reorderStagesSchema = z.object({
  positionId: z.uuid(),
  /** The full ordered list. Order is rewritten from array position, never swapped. */
  orderedStageIds: z.array(z.uuid()).min(1, "At least one stage is required"),
});


export type CreateStageInput = z.infer<typeof createStageSchema>;
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
export type StageFormInput = Omit<CreateStageInput, "positionId">;

export const EMPTY_STAGE: StageFormInput = {
  name: "",
  description: "",
  kind: "interview",
  requiresScorecard: true,
  minScorecards: 1,
  slaDays: "",
};

export const setStageInterviewersSchema = z.object({
  stageId: z.uuid(),
  /** The full desired panel. An empty list clears it, which is allowed. */
  userIds: z.array(z.string().min(1)).max(20, "That is a large panel"),
});

export type SetStageInterviewersInput = z.infer<typeof setStageInterviewersSchema>;

export const archiveStageSchema = z.object({
  stageId: z.uuid(),
  /** Required only when the stage is currently holding active candidates. */
  destinationStageId: z.uuid().optional(),
});

export type ArchiveStageInput = z.infer<typeof archiveStageSchema>;
