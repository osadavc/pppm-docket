import type { UserRole } from "./roles";

/**
 * The role matrix as code. This is a *declaration* of intent used to drive
 * navigation and page guards — it is not the only line of defence. Every Server
 * Action and Route Handler re-authorizes independently, and row-scoped access
 * (an interviewer only sees applications they were assigned to) is enforced in
 * the query layer via joins through `interview_participants`.
 */
export const PERMISSIONS = {
  "position:view": ["hr", "management"],
  "position:manage": ["hr"],
  // The story reads "As a hiring manager, I want to define a custom sequence of
  // interview stages", and across this backlog "hiring manager" means the
  // management tier (approving positions, changing roles) while "HR executive"
  // means hr. The interview process for a role belongs to the manager hiring
  // for it, so this is management-only.
  "position:stages:manage": ["management"],
  "position:submit": ["hr"],
  "position:approve": ["management"],
  "template:manage": ["hr"],
  "template:view": ["hr", "management"],
  "candidate:view": ["hr", "management"],
  "candidate:manage": ["hr"],
  "application:view": ["hr", "management"],
  "application:manage": ["hr"],
  "application:override-gate": ["hr"],
  "interview:view": ["hr", "management"],
  "interview:manage": ["hr"],
  "scorecard:read-all": ["hr", "management"],
  "comparison:view": ["hr", "management"],
  "attachment:upload": ["hr"],
  "report:view": ["hr", "management"],
  "report:export": ["hr", "management"],
  "activity:view-global": ["management"],
  "user:manage": ["management"],
  "notification:view": ["management"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}
