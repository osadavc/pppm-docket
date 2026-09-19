import "server-only";

import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  applications,
  applicationStages,
  attachments,
  candidates,
  positions,
  positionStageInterviewers,
  positionStages,
  scorecards,
  user,
} from "@/db/schema";
import { paceFor, type Pace } from "@/lib/domain/pace";
import { isUserRole, type UserRole } from "@/lib/auth/roles";

export type StagePanelMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  jobTitle: string | null;
};

export type EligiblePanelFeedback = {
  userId: string;
  name: string;
  submittedScorecardId: string | null;
};

/**
 * The current, active panel and each member's submitted feedback for one
 * application-stage. Returning one row per assignment gives the advancement
 * gate and its outstanding-interviewer list a single eligibility definition.
 */
export async function listEligiblePanelFeedback(
  applicationId: string,
  positionStageId: string,
): Promise<EligiblePanelFeedback[]> {
  return db
    .select({
      userId: positionStageInterviewers.userId,
      name: user.name,
      submittedScorecardId: scorecards.id,
    })
    .from(positionStageInterviewers)
    .innerJoin(
      user,
      and(
        eq(user.id, positionStageInterviewers.userId),
        eq(user.isActive, true),
      ),
    )
    .leftJoin(
      applicationStages,
      and(
        eq(applicationStages.applicationId, applicationId),
        eq(applicationStages.positionStageId, positionStageId),
      ),
    )
    .leftJoin(
      scorecards,
      and(
        eq(scorecards.applicationId, applicationId),
        eq(scorecards.applicationStageId, applicationStages.id),
        eq(scorecards.authorId, positionStageInterviewers.userId),
        eq(scorecards.status, "submitted"),
      ),
    )
    .where(eq(positionStageInterviewers.positionStageId, positionStageId))
    .orderBy(asc(user.name));
}

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
export async function listAssignableInterviewers(): Promise<
  StagePanelMember[]
> {
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
 * Whether an interviewer may see a given application: true only while the
 * application is active and currently sits at a stage assigned to them.
 */
export async function interviewerCanViewApplication(
  userId: string,
  applicationId: string,
) {
  const [row] = await db
    .select({ id: applications.id })
    .from(applications)
    .innerJoin(
      positionStageInterviewers,
      and(
        eq(
          positionStageInterviewers.positionStageId,
          applications.currentStageId,
        ),
        eq(positionStageInterviewers.userId, userId),
      ),
    )
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.status, "active"),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export type AssignedCandidate = {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  candidateTitle: string | null;
  positionId: string;
  positionTitle: string;
  stageId: string;
  stageName: string;
  stageOrder: number;
  enteredAt: Date | null;
  pace: Pace;
  feedbackStatus: "awaiting" | "submitted";
  /** Opaque database id only; the queue never receives a storage path or URL. */
  cvAttachmentId: string | null;
};

export type AssignedStageQueue = {
  key: string;
  positionId: string;
  positionTitle: string;
  stageId: string;
  stageName: string;
  stageOrder: number;
  candidates: AssignedCandidate[];
};

/**
 * The viewer's live assessment queue.
 *
 * Assignment, active status and current-stage matching all live in this query.
 * Callers never receive candidates from another stage and do not need to
 * filter a broader application collection in memory.
 */
export async function listAssignedActiveCandidates(
  userId: string,
  now: Date = new Date(),
): Promise<AssignedStageQueue[]> {
  const rows = await db
    .select({
      applicationId: applications.id,
      candidateId: candidates.id,
      candidateName: candidates.fullName,
      candidateTitle: candidates.currentTitle,
      positionId: positions.id,
      positionTitle: positions.title,
      stageId: positionStages.id,
      stageName: positionStages.name,
      stageOrder: positionStages.orderIndex,
      enteredAt: applicationStages.enteredAt,
      submittedScorecardId: scorecards.id,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(positions, eq(positions.id, applications.positionId))
    .innerJoin(
      positionStages,
      eq(positionStages.id, applications.currentStageId),
    )
    .innerJoin(
      positionStageInterviewers,
      and(
        eq(positionStageInterviewers.positionStageId, positionStages.id),
        eq(positionStageInterviewers.userId, userId),
      ),
    )
    .innerJoin(
      applicationStages,
      and(
        eq(applicationStages.applicationId, applications.id),
        eq(applicationStages.positionStageId, positionStages.id),
      ),
    )
    .leftJoin(
      scorecards,
      and(
        eq(scorecards.applicationStageId, applicationStages.id),
        eq(scorecards.authorId, userId),
        eq(scorecards.status, "submitted"),
      ),
    )
    .where(eq(applications.status, "active"))
    .orderBy(
      asc(positions.title),
      asc(positionStages.orderIndex),
      asc(applicationStages.enteredAt),
      asc(candidates.fullName),
    );

  const cvByApplication = new Map<string, string>();
  if (rows.length > 0) {
    const cvRows = await db
      .select({
        id: attachments.id,
        applicationId: attachments.applicationId,
      })
      .from(attachments)
      .where(
        and(
          inArray(
            attachments.applicationId,
            rows.map((row) => row.applicationId),
          ),
          eq(attachments.kind, "cv"),
        ),
      )
      .orderBy(desc(attachments.createdAt));

    // Rows are newest first. Keep the first CV for each application.
    for (const cv of cvRows) {
      if (cv.applicationId && !cvByApplication.has(cv.applicationId)) {
        cvByApplication.set(cv.applicationId, cv.id);
      }
    }
  }

  const groups = new Map<string, AssignedStageQueue>();

  for (const row of rows) {
    const key = `${row.positionId}:${row.stageId}`;
    const group = groups.get(key) ?? {
      key,
      positionId: row.positionId,
      positionTitle: row.positionTitle,
      stageId: row.stageId,
      stageName: row.stageName,
      stageOrder: row.stageOrder,
      candidates: [],
    };

    group.candidates.push({
      applicationId: row.applicationId,
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      candidateTitle: row.candidateTitle,
      positionId: row.positionId,
      positionTitle: row.positionTitle,
      stageId: row.stageId,
      stageName: row.stageName,
      stageOrder: row.stageOrder,
      enteredAt: row.enteredAt,
      pace: paceFor(row.enteredAt, now),
      feedbackStatus: row.submittedScorecardId ? "submitted" : "awaiting",
      cvAttachmentId: cvByApplication.get(row.applicationId) ?? null,
    });

    groups.set(key, group);
  }

  return Array.from(groups.values());
}

/**
 * Active assignments that still need this viewer's submitted scorecard.
 *
 * Drafts intentionally remain outstanding: the left join only matches a
 * submitted scorecard by this viewer for this exact application-stage.
 */
export async function countOutstandingFeedback(userId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(applications)
    .innerJoin(
      positionStageInterviewers,
      and(
        eq(
          positionStageInterviewers.positionStageId,
          applications.currentStageId,
        ),
        eq(positionStageInterviewers.userId, userId),
      ),
    )
    .innerJoin(
      applicationStages,
      and(
        eq(applicationStages.applicationId, applications.id),
        eq(applicationStages.positionStageId, applications.currentStageId),
      ),
    )
    .leftJoin(
      scorecards,
      and(
        eq(scorecards.applicationStageId, applicationStages.id),
        eq(scorecards.authorId, userId),
        eq(scorecards.status, "submitted"),
      ),
    )
    .where(and(eq(applications.status, "active"), isNull(scorecards.id)));

  return row?.total ?? 0;
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
        eq(
          positionStageInterviewers.positionStageId,
          applicationStages.positionStageId,
        ),
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
      and(
        eq(applications.positionId, positionId),
        eq(applications.status, "active"),
      ),
    )
    .groupBy(applications.currentStageId);

  const feedback = await db
    .select({ stageId: applicationStages.positionStageId, n: count() })
    .from(scorecards)
    .innerJoin(
      applicationStages,
      eq(applicationStages.id, scorecards.applicationStageId),
    )
    .innerJoin(
      positionStages,
      eq(positionStages.id, applicationStages.positionStageId),
    )
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
