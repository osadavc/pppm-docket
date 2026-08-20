import "server-only";

import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  applications,
  applicationStages,
  positionStageInterviewers,
  positionStages,
  scorecards,
  user,
} from "@/db/schema";
import { isUserRole, type UserRole } from "@/lib/auth/roles";

export type StagePanelMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  jobTitle: string | null;
};

/** The standing panel for every stage of a position, keyed by stage id. */
export async function getStagePanels(positionId: string) {
  const rows = await db
    .select({
      id: positionStageInterviewers.id,
      stageId: positionStageInterviewers.positionStageId,
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle,
    })
    .from(positionStageInterviewers)
    .innerJoin(user, eq(user.id, positionStageInterviewers.userId))
    .innerJoin(
      positionStages,
      eq(positionStages.id, positionStageInterviewers.positionStageId),
    )
    .where(eq(positionStages.positionId, positionId))
    .orderBy(asc(user.name));

  const byStage = new Map<string, StagePanelMember[]>();
  for (const r of rows) {
    const list = byStage.get(r.stageId) ?? [];
    list.push({
      id: r.id,
      userId: r.userId,
      name: r.name,
      email: r.email,
      role: isUserRole(r.role) ? r.role : "interviewer",
      jobTitle: r.jobTitle,
    });
    byStage.set(r.stageId, list);
  }
  return byStage;
}

/** Everyone who could sit on a panel. */
export async function listAssignableInterviewers(): Promise<StagePanelMember[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle,
    })
    .from(user)
    .where(eq(user.isActive, true))
    .orderBy(asc(user.name));

  return rows.map((r) => ({
    id: r.id,
    userId: r.id,
    name: r.name,
    email: r.email,
    role: isUserRole(r.role) ? r.role : "interviewer",
    jobTitle: r.jobTitle,
  }));
}

/**
 * The positions an interviewer has been made responsible for.
 *
 * Written as an inner join through the assignment table rather than as a filter
 * applied afterwards, so an unassigned row physically cannot be returned even
 * if a caller forgets a guard.
 */
export async function listPositionIdsVisibleToInterviewer(userId: string) {
  const rows = await db
    .selectDistinct({ positionId: positionStages.positionId })
    .from(positionStageInterviewers)
    .innerJoin(
      positionStages,
      eq(positionStages.id, positionStageInterviewers.positionStageId),
    )
    .where(eq(positionStageInterviewers.userId, userId));

  return rows.map((r) => r.positionId);
}

/**
 * Whether an interviewer may see a given application: true only if they sit on
 * the panel for at least one stage of that application's position.
 */
export async function interviewerCanViewApplication(
  userId: string,
  applicationId: string,
) {
  const [row] = await db
    .select({ id: applications.id })
    .from(applications)
    .innerJoin(positionStages, eq(positionStages.positionId, applications.positionId))
    .innerJoin(
      positionStageInterviewers,
      and(
        eq(positionStageInterviewers.positionStageId, positionStages.id),
        eq(positionStageInterviewers.userId, userId),
      ),
    )
    .where(eq(applications.id, applicationId))
    .limit(1);

  return Boolean(row);
}

/** Stage ids on a given application that this interviewer is responsible for. */
export async function assignedStageIdsForInterviewer(
  userId: string,
  applicationId: string,
) {
  const rows = await db
    .select({ applicationStageId: applicationStages.id })
    .from(applicationStages)
    .innerJoin(
      positionStageInterviewers,
      and(
        eq(positionStageInterviewers.positionStageId, applicationStages.positionStageId),
        eq(positionStageInterviewers.userId, userId),
      ),
    )
    .where(eq(applicationStages.applicationId, applicationId));

  return rows.map((r) => r.applicationStageId);
}


export type StageOccupancy = {
  stageId: string;
  /** Active candidates sitting on this stage right now. */
  activeCandidates: number;
  /** Scorecards ever submitted at this stage — what archiving must preserve. */
  submittedScorecards: number;
};

/**
 * How many people a stage is currently holding, and how much feedback is
 * attached to it. Drives the "choose a destination" requirement when archiving.
 */
export async function getStageOccupancy(positionId: string) {
  const stages = await db
    .select({ id: positionStages.id })
    .from(positionStages)
    .where(eq(positionStages.positionId, positionId));

  // Grouped joins rather than correlated subqueries: interpolating the outer
  // table's own columns into a subquery emits an unqualified "id", which
  // Postgres rejects as ambiguous.
  const occupied = await db
    .select({ stageId: applications.currentStageId, n: count() })
    .from(applications)
    .where(
      and(eq(applications.positionId, positionId), eq(applications.status, "active")),
    )
    .groupBy(applications.currentStageId);

  const feedback = await db
    .select({ stageId: applicationStages.positionStageId, n: count() })
    .from(scorecards)
    .innerJoin(applicationStages, eq(applicationStages.id, scorecards.applicationStageId))
    .innerJoin(positionStages, eq(positionStages.id, applicationStages.positionStageId))
    .where(
      and(
        eq(positionStages.positionId, positionId),
        eq(scorecards.status, "submitted"),
      ),
    )
    .groupBy(applicationStages.positionStageId);

  const occupiedBy = new Map(occupied.map((r) => [r.stageId, r.n]));
  const feedbackBy = new Map(feedback.map((r) => [r.stageId, r.n]));

  return new Map<string, StageOccupancy>(
    stages.map((s) => [
      s.id,
      {
        stageId: s.id,
        activeCandidates: occupiedBy.get(s.id) ?? 0,
        submittedScorecards: feedbackBy.get(s.id) ?? 0,
      },
    ]),
  );
}
