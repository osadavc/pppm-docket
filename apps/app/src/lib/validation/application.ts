import { z } from "zod";

export const candidateEmailSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "Enter an email subject")
    .max(200, "Email subject is too long")
    .refine((value) => !/[\r\n]/.test(value), {
      message: "Email subject must be one line",
    }),
  body: z
    .string()
    .trim()
    .min(1, "Enter an email message")
    .max(10_000, "Email message is too long"),
});

export type CandidateEmailInput = z.infer<typeof candidateEmailSchema>;

export const OVERRIDE_REASON_MIN_LENGTH = 10;

export const advanceApplicationSchema = z.object({
  applicationId: z.uuid(),
  note: z.string().trim().max(2000).optional(),
  /** Presence means HR explicitly selected “Email candidate”. */
  notification: candidateEmailSchema.optional(),
  /**
   * Present only when HR is deliberately moving someone past an unsatisfied
   * feedback gate. Required in that case so the reason is on the record, and
   * long enough that "ok" cannot pass for one, the same floor the dialog
   * applies before enabling the button.
   */
  overrideReason: z.preprocess(
    // A blank textarea is "no override", not a too-short reason.
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .string()
      .trim()
      .min(
        OVERRIDE_REASON_MIN_LENGTH,
        `Explain the override in at least ${OVERRIDE_REASON_MIN_LENGTH} characters`,
      )
      .max(2000)
      .optional(),
  ),
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
    /** Presence means HR explicitly selected “Email candidate”. */
    notification: candidateEmailSchema.optional(),
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

/** Ad-hoc HR email to a candidate from their application. */
export const customEmailSchema = z.object({
  applicationId: z.uuid(),
  subject: z
    .string()
    .trim()
    .min(3, "Subject needs at least 3 characters")
    .max(200, "Subject is too long")
    .refine((value) => !/[\r\n]/.test(value), {
      message: "Subject must be one line",
    }),
  body: z
    .string()
    .trim()
    .min(10, "Write at least 10 characters")
    .max(5000, "Message is too long (5,000 characters max)"),
});

export type CustomEmailInput = z.infer<typeof customEmailSchema>;
