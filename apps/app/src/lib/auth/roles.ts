import type { UserRole } from "@/db/schema/enums";

export type { UserRole };

export const ROLES = ["hr", "interviewer", "management"] as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  hr: "HR / Recruiter",
  interviewer: "Interviewer",
  management: "Management",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  hr: "Opens positions, adds candidates and runs the process.",
  interviewer: "Gives feedback at their assigned stage.",
  management: "Oversight, reporting and user administration.",
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
