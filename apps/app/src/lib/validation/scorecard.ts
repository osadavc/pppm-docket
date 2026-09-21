import { z } from "zod";

export const recommendationValues = [
  "strong_no",
  "no",
  "yes",
  "strong_yes",
] as const;

export const RECOMMENDATION_LABELS = {
  strong_no: "Strong no",
  no: "No",
  yes: "Yes",
  strong_yes: "Strong yes",
} as const;

export const NARRATIVE_REQUIRED_MESSAGE =
  "Write at least a couple of sentences — this drives the decision.";

export const scorecardSubmissionSchema = z
  .object({
    applicationId: z.uuid(),
    intent: z.enum(["submit", "revise"]),
    baseRevision: z.coerce.number().int().min(0),
    recommendation: z.enum(recommendationValues).nullable(),
    strengths: z.string().trim().max(5000, "Strengths are too long"),
    concerns: z.string().trim().max(5000, "Concerns are too long"),
    notes: z.string().trim().max(5000, "Notes are too long"),
    ratings: z
      .array(
        z.object({
          criterionId: z.uuid(),
          rating: z.number().int().min(1).max(5).nullable(),
          comment: z.string().trim().max(2000, "Criterion comment is too long"),
        }),
      )
      .max(50),
  })
  .superRefine((value, context) => {
    if (!value.recommendation) {
      context.addIssue({
        code: "custom",
        path: ["recommendation"],
        message: "Choose a recommendation",
      });
    }

    if (
      ![value.strengths, value.concerns, value.notes].some(
        (narrative) => narrative.length >= 20,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["narrative"],
        message: NARRATIVE_REQUIRED_MESSAGE,
      });
    }
  });

export type ScorecardSubmissionInput = z.infer<
  typeof scorecardSubmissionSchema
>;
