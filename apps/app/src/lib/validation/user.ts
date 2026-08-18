import { z } from "zod";
import { ROLES } from "@/lib/auth/roles";

export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(120, "Name is too long"),
  email: z
    .email("Enter a valid email address")
    .transform((v) => v.trim().toLowerCase()),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
  role: z.enum(ROLES, { message: "Choose a role" }),
  jobTitle: z.string().trim().max(120).optional().or(z.literal("")),
  department: z.string().trim().max(120).optional().or(z.literal("")),
});

export type CreateUserInput = z.input<typeof createUserSchema>;

export const changeRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES, { message: "Choose a role" }),
});

export const setPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
});

export type ChangeRoleInput = z.input<typeof changeRoleSchema>;
export type SetPasswordInput = z.input<typeof setPasswordSchema>;
