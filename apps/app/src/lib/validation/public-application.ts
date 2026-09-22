import { z } from "zod";

/**
 * Ten attempts per address per hour. Every attempt counts, including ones
 * refused by validation, so a script probing the form burns its allowance;
 * a person fixing a typo or two never notices.
 */
export const PUBLIC_APPLY_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };

/** Off-screen field; a real browser never fills it. */
export const HONEYPOT_FIELD = "website";

export const publicApplicationSchema = z.object({
  positionId: z.uuid(),
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name")
    .max(160, "Name is too long"),
  // Normalise before validating so " Pat@Example.com " is the same person
  // as "pat@example.com", the unique index compares the stored form.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address")),
  phone: z.string().trim().max(40, "Phone number is too long").optional(),
  salaryExpectation: z
    .string()
    .trim()
    .max(60, "Keep salary expectation under 60 characters")
    .optional(),
});

export type PublicApplicationInput = z.infer<typeof publicApplicationSchema>;
