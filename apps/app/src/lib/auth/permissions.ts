import type { UserRole } from "./roles";

/**
 * The role matrix as code. This is a *declaration* of intent used to drive
 * navigation and page guards, it is not the only line of defence. Every Server
 * Action and Route Handler re-authorizes independently, and row-scoped access
 * (an interviewer only sees active applications currently at a stage assigned
 * to them) is enforced in the query layer via `position_stage_interviewers`.
 */
export const PERMISSIONS = {
  "position:view": ["hr", "management"],
  "position:manage": ["hr"],
  // HR runs the hiring process day to day, so it shapes each role's stages
  // alongside the hiring manager.
  "position:stages:manage": ["hr", "management"],
  "position:submit": ["hr"],
  "position:approve": ["management"],
  "template:view": ["hr", "management"],
  "candidate:view": ["hr", "management"],
  "candidate:manage": ["hr"],
  "application:view": ["hr", "management"],
  "application:manage": ["hr"],
  "application:override-gate": ["hr"],
  /**
   * Skipping a stage, moving someone backwards, holding and resuming are
   * exceptions to the normal flow. HR runs the process; departing from it is
   * the hiring manager’s call, so this is management-only and deliberately
   * separate from "application:manage".
   */
  "application:override-flow": ["management"],
  "interview:manage": ["hr"],
  "scorecard:read-all": ["hr", "management"],
  "comparison:view": ["hr", "management"],
  "attachment:upload": ["hr"],
  "report:view": ["hr", "management"],
  "report:export": ["hr", "management"],
  "activity:view-global": ["management"],
  "user:manage": ["management"],
  "queue:view": ["hr", "interviewer", "management"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}
