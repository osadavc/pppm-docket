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

export const REJECTION_REASONS = [
  "insufficient_experience",
  "skills_mismatch",
  "failed_assessment",
  "communication_concerns",
  "values_mismatch",
  "salary_expectations",
  "right_to_work_or_location",
  "stronger_candidate_selected",
  "position_closed",
  "other",
] as const;

export const REJECTION_REASON_LABELS: Record<
  (typeof REJECTION_REASONS)[number],
  string
> = {
  insufficient_experience: "Not enough experience",
  skills_mismatch: "Skills do not match the role",
  failed_assessment: "Did not pass an assessment or interview",
  communication_concerns: "Communication concerns",
  values_mismatch: "Not aligned with how we work",
  salary_expectations: "Salary expectations out of range",
  right_to_work_or_location: "Location or right to work",
  stronger_candidate_selected: "A stronger candidate was chosen",
  position_closed: "The position closed",
  other: "Other",
};

export const rejectApplicationSchema = z
  .object({
    applicationId: z.uuid(),
    reason: z.enum(REJECTION_REASONS, {
      message: "Choose a rejection reason",
    }),
    note: z.string().trim().max(2000).optional(),
  })
  // "Other" with no explanation is the one answer that tells analytics nothing,
  // so it is the one case where the free-text note is mandatory.
  .refine((v) => v.reason !== "other" || (v.note?.length ?? 0) >= 10, {
    message: "Explain the reason when choosing Other",
    path: ["note"],
  });

export type RejectApplicationInput = z.infer<typeof rejectApplicationSchema>;

export const hireApplicationSchema = z.object({
  applicationId: z.uuid(),
  note: z.string().trim().max(2000).optional(),
});

export type HireApplicationInput = z.infer<typeof hireApplicationSchema>;
