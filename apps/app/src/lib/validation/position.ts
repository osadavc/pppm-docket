import { z } from "zod";

/**
 * One schema serves the form and the Server Action.
 *
 * It deliberately contains no transforms or coercion: if input and output
 * shapes diverge, zodResolver and react-hook-form disagree about the field
 * types. Values arrive as the strings an HTML form produces and are normalised
 * server-side by `normalizePositionInput`.
 *
 * Draft rules are loose on purpose — a draft exists so a vacancy can be
 * prepared before it is advertised, so only a title and department are
 * required. Publishing will apply a stricter schema; that belongs with the
 * publish story.
 */
const numericString = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+$/.test(v), {
      message: `${label} must be a whole number`,
    });

export const positionDraftSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Title must be at least 3 characters")
      .max(160, "Title is too long"),
    department: z
      .string()
      .trim()
      .min(2, "Department is required")
      .max(120, "Department is too long"),
    location: z.string().trim().max(160).optional(),
    employmentType: z.enum(["full_time", "part_time", "contract", "internship"]),
    description: z.string().max(20000).optional(),
    requirements: z.string().max(20000).optional(),
    openings: z
      .number({ message: "Enter how many people you are hiring" })
      .int("Openings must be a whole number")
      .min(1, "There must be at least one opening")
      .max(999, "That is an unlikely number of openings"),
    applicationDeadline: z
      .string()
      .trim()
      .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), {
        message: "Enter a valid date",
      })
      .refine((v) => v === "" || new Date(`${v}T23:59:59`) > new Date(), {
        message: "The deadline must be in the future",
      }),
    salaryMin: numericString("Minimum salary"),
    salaryMax: numericString("Maximum salary"),
    requireFeedbackToAdvance: z.boolean(),
    hiringManagerId: z.string().optional(),
  })
  .refine(
    (v) =>
      v.salaryMin === "" ||
      v.salaryMax === "" ||
      Number(v.salaryMax) >= Number(v.salaryMin),
    { message: "Maximum salary must not be below the minimum", path: ["salaryMax"] },
  );

export type PositionDraftInput = z.infer<typeof positionDraftSchema>;

/** Turn validated form strings into the column types the table expects. */
export function normalizePositionInput(d: PositionDraftInput) {
  return {
    title: d.title,
    department: d.department,
    location: d.location?.trim() || null,
    employmentType: d.employmentType,
    description: d.description?.trim() || "",
    requirements: d.requirements?.trim() || null,
    openings: d.openings,
    // Applications close at the end of the chosen day.
    applicationDeadline: d.applicationDeadline
      ? new Date(`${d.applicationDeadline}T23:59:59`)
      : null,
    salaryMin: d.salaryMin === "" ? null : Number(d.salaryMin),
    salaryMax: d.salaryMax === "" ? null : Number(d.salaryMax),
    requireFeedbackToAdvance: d.requireFeedbackToAdvance,
    hiringManagerId: d.hiringManagerId || null,
  };
}

export const EMPTY_POSITION_DRAFT: PositionDraftInput = {
  title: "",
  department: "",
  location: "",
  employmentType: "full_time",
  description: "",
  requirements: "",
  openings: 1,
  applicationDeadline: "",
  salaryMin: "",
  salaryMax: "",
  requireFeedbackToAdvance: true,
  hiringManagerId: "",
};

export const approvePositionSchema = z.object({
  positionId: z.uuid(),
  // A manager may approve without comment; a rejection must explain itself.
  note: z.string().trim().max(2000).optional(),
});

export const rejectPositionSchema = z.object({
  positionId: z.uuid(),
  note: z
    .string()
    .trim()
    .min(10, "Tell HR what needs to change — at least 10 characters")
    .max(2000, "Note is too long"),
});

export type ApprovePositionInput = z.infer<typeof approvePositionSchema>;
export type RejectPositionInput = z.infer<typeof rejectPositionSchema>;
