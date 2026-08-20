import { z } from "zod";

export const candidateSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(160, "Name is too long"),
  email: z
    .email("Enter a valid email address")
    .transform((v) => v.trim().toLowerCase()),
  phone: z.string().trim().max(40).optional(),
  location: z.string().trim().max(160).optional(),
  linkedinUrl: z
    .union([z.url("Enter a valid URL"), z.literal("")])
    .optional(),
  currentTitle: z.string().trim().max(160).optional(),
  currentCompany: z.string().trim().max(160).optional(),
  source: z.enum(["careers_site", "referral", "agency", "linkedin", "other"]),
  referredById: z.string().optional(),
  notes: z.string().trim().max(4000).optional(),
  /** Which position this candidate is entering the pipeline for. */
  positionId: z.uuid("Choose a position"),
});

export type CandidateInput = z.infer<typeof candidateSchema>;

export const CANDIDATE_SOURCE_LABELS = {
  careers_site: "Careers site",
  referral: "Referral",
  agency: "Agency",
  linkedin: "LinkedIn",
  other: "Other",
} as const;
