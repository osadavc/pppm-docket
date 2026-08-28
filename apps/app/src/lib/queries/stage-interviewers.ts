import "server-only";

import { alias } from "drizzle-orm/pg-core";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  applications,
  applicationStages,
  candidates,
  positions,
  positionStageInterviewers,
  positionStages,
  scorecards,
  user,
} from "@/db/schema";
import { isUserRole, type UserRole } from "@/lib/auth/roles";

const MY_APPLICATIONS_PAGE_SIZE = 25;

export type InterviewerApplication = {
  applicationId: string;
  candidateName: string;
  positionTitle: string;
  currentStageName: string | null;
  status: string;
  appliedAt: Date;
};

export type InterviewerScorecardContext = {
  applicationId: string;
  candidateName: string;
  stageName: string;
  recommendation: "strong_no" | "no" | "yes" | "strong_yes" | null;
  strengths: string | null;
  concerns: string | null;
  notes: string | null;
  hasSubmitted: boolean;
};

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
 * The interviewer's navigable work queue. Its join through the panel
 * assignment is intentionally the same scope as `interviewerCanViewApplication`,
 * so every row returned here is safe to open from the list.
 */
export async function listApplicationsVisibleToInterviewer(
  userId: string,
  page: number,
) {
  const assignedStages = alias(positionStages, "assigned_stages");
  const offset = (page - 1) * MY_APPLICATIONS_PAGE_SIZE;

  // An interviewer may sit on more than one panel for a position. De-duplicate
  // here, before the count and pagination are applied, so an application
  // appears once and totals remain accurate.
  const visibleApplications = db.$with("interviewer_visible_applications").as(
    db
      .selectDistinct({
        applicationId: applications.id,
        candidateName: candidates.fullName,
        positionTitle: positions.title,
        currentStageName: positionStages.name,
        status: applications.status,
        appliedAt: applications.appliedAt,
      })
      .from(positionStageInterviewers)
      .innerJoin(
        assignedStages,
        eq(assignedStages.id, positionStageInterviewers.positionStageId),
      )
      .innerJoin(applications, eq(applications.positionId, assignedStages.positionId))
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .innerJoin(positions, eq(positions.id, applications.positionId))
      .leftJoin(positionStages, eq(positionStages.id, applications.currentStageId))
      .where(eq(positionStageInterviewers.userId, userId)),
  );

  const rows = await db
    .with(visibleApplications)
    .select({
      applicationId: visibleApplications.applicationId,
      candidateName: visibleApplications.candidateName,
      positionTitle: visibleApplications.positionTitle,
      currentStageName: visibleApplications.currentStageName,
      status: visibleApplications.status,
      appliedAt: visibleApplications.appliedAt,
      total: sql<number>`count(*) over()::int`,
    })
    .from(visibleApplications)
    .orderBy(desc(visibleApplications.appliedAt), asc(visibleApplications.candidateName))
    .limit(MY_APPLICATIONS_PAGE_SIZE)
    .offset(offset);

  // As with the candidate list, a window count cannot describe an empty page
  // reached through a hand-edited URL.
  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && page > 1) {
    const [counted] = await db
      .with(visibleApplications)
      .select({ n: count() })
      .from(visibleApplications);
    total = counted?.n ?? 0;
  }

  return {
    rows: rows as (InterviewerApplication & { total: number })[],
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / MY_APPLICATIONS_PAGE_SIZE)),
    pageSize: MY_APPLICATIONS_PAGE_SIZE,
  };
}

/**
 * The scorecard editor is available only at the candidate's current stage.
 * The Server Action repeats this scope check before it writes, protecting
 * against stale pages and forged requests.
 */
export async function getInterviewerScorecardContext(
  userId: string,
  applicationId: string,
): Promise<InterviewerScorecardContext | null> {
  const [row] = await db
    .select({
      applicationId: applications.id,
      candidateName: candidates.fullName,
      stageName: positionStages.name,
      recommendation: scorecards.recommendation,
      strengths: scorecards.strengths,
      concerns: scorecards.concerns,
      notes: scorecards.notes,
      status: scorecards.status,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(positionStages, eq(positionStages.id, applications.currentStageId))
    .innerJoin(
      applicationStages,
      and(
        eq(applicationStages.applicationId, applications.id),
        eq(applicationStages.positionStageId, applications.currentStageId),
      ),
    )
    .innerJoin(
      positionStageInterviewers,
      and(
        eq(positionStageInterviewers.positionStageId, applications.currentStageId),
        eq(positionStageInterviewers.userId, userId),
      ),
    )
    .leftJoin(
      scorecards,
      and(
        eq(scorecards.applicationStageId, applicationStages.id),
        eq(scorecards.authorId, userId),
      ),
    )
    .where(and(eq(applications.id, applicationId), eq(applications.status, "active")))
    .limit(1);

  if (!row) return null;
  return {
    applicationId: row.applicationId,
    candidateName: row.candidateName,
    stageName: row.stageName,
    recommendation: row.recommendation,
    strengths: row.strengths,
    concerns: row.concerns,
    notes: row.notes,
    hasSubmitted: row.status === "submitted",
  };
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
