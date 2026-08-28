import { z } from "zod";

export const RECOMMENDATIONS = [
  "strong_no",
  "no",
  "yes",
  "strong_yes",
] as const;

export const RECOMMENDATION_LABELS: Record<(typeof RECOMMENDATIONS)[number], string> = {
  strong_no: "Strong no",
  no: "No",
  yes: "Yes",
  strong_yes: "Strong yes",
};

export const submitScorecardSchema = z.object({
  applicationId: z.uuid(),
  recommendation: z.enum(RECOMMENDATIONS),
  strengths: z.string().trim().max(2_000).optional(),
  concerns: z.string().trim().max(2_000).optional(),
  notes: z.string().trim().max(4_000).optional(),
});

export type SubmitScorecardInput = z.infer<typeof submitScorecardSchema>;
