import { z } from "zod";

export const advanceApplicationSchema = z.object({
  applicationId: z.uuid(),
  note: z.string().trim().max(2000).optional(),
  /**
   * Present only when HR is deliberately moving someone past an unsatisfied
   * feedback gate. Required in that case so the reason is on the record.
   */
  overrideReason: z.string().trim().max(2000).optional(),
});

export type AdvanceApplicationInput = z.infer<typeof advanceApplicationSchema>;

/** Every exception carries an optional note explaining why it was needed. */
const noteField = z.string().trim().max(2000).optional();

export const skipStageSchema = z.object({
  applicationId: z.uuid(),
  note: noteField,
});

export const moveBackSchema = z.object({
  applicationId: z.uuid(),
  /** Defaults to the previous live stage when omitted. */
  toStageId: z.uuid().optional(),
  note: noteField,
});

export const holdApplicationSchema = z.object({
  applicationId: z.uuid(),
  note: noteField,
});

export const resumeApplicationSchema = z.object({
  applicationId: z.uuid(),
  note: noteField,
});

export type SkipStageInput = z.infer<typeof skipStageSchema>;
export type MoveBackInput = z.infer<typeof moveBackSchema>;
export type HoldApplicationInput = z.infer<typeof holdApplicationSchema>;
export type ResumeApplicationInput = z.infer<typeof resumeApplicationSchema>;
