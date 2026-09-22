import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  applications,
  applicationStages,
  candidates,
  positions,
  applicationStagePanels,
  positionStages,
  scorecardCriteria,
  scorecardRatings,
  scorecardRevisions,
  scorecards,
} from "@/db/schema";
import type { Recommendation } from "@/db/schema/enums";
import type { SessionUser } from "@/lib/auth/guards";
import { canViewApplication } from "./activity";

export type FeedbackCriterion = {
  id: string;
  label: string;
  description: string | null;
  weight: number;
  orderIndex: number;
  rating: number | null;
  comment: string;
};

export type FeedbackContext = {
  applicationId: string;
  applicationStageId: string;
  candidateName: string;
  candidateTitle: string | null;
  positionId: string;
  positionTitle: string;
  stageId: string;
  stageName: string;
  stageDescription: string | null;
  scorecard: {
    id: string;
    status: "draft" | "submitted";
    recommendation: Recommendation | null;
    strengths: string;
    concerns: string;
    notes: string;
    submittedAt: Date | null;
    revisionNumber: number;
  } | null;
  criteria: FeedbackCriterion[];
};

/**
 * Load the viewer's scorecard for the application's current stage.
 *
 * This is deliberately assignment-scoped in SQL. An application id alone is
 * never enough to obtain candidate or scorecard data, and inactive/off-stage
 * applications cannot produce a form context.
 */
export async function getFeedbackContext(
  userId: string,
  applicationId: string,
): Promise<FeedbackContext | null> {
  const [row] = await db
    .select({
      applicationId: applications.id,
      applicationStageId: applicationStages.id,
      candidateName: candidates.fullName,
      candidateTitle: candidates.currentTitle,
      positionId: positions.id,
      positionTitle: positions.title,
      stageId: positionStages.id,
      stageName: positionStages.name,
      stageDescription: positionStages.description,
      scorecardId: scorecards.id,
      scorecardStatus: scorecards.status,
      recommendation: scorecards.recommendation,
      strengths: scorecards.strengths,
      concerns: scorecards.concerns,
      notes: scorecards.notes,
      submittedAt: scorecards.submittedAt,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(positions, eq(positions.id, applications.positionId))
    .innerJoin(
      positionStages,
      eq(positionStages.id, applications.currentStageId),
    )
    .innerJoin(
      applicationStages,
      and(
        eq(applicationStages.applicationId, applications.id),
        eq(applicationStages.positionStageId, positionStages.id),
      ),
    )
    .innerJoin(
      applicationStagePanels,
      and(
        eq(applicationStagePanels.applicationStageId, applicationStages.id),
        eq(applicationStagePanels.userId, userId),
      ),
    )
    .leftJoin(
      scorecards,
      and(
        eq(scorecards.applicationStageId, applicationStages.id),
        eq(scorecards.authorId, userId),
      ),
    )
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.status, "active"),
        eq(applicationStages.status, "in_progress"),
      ),
    )
    .limit(1);

  if (!row) return null;

  const [latestRevision] = row.scorecardId
    ? await db
        .select({ revisionNumber: scorecardRevisions.revisionNumber })
        .from(scorecardRevisions)
        .where(eq(scorecardRevisions.scorecardId, row.scorecardId))
        .orderBy(desc(scorecardRevisions.revisionNumber))
        .limit(1)
    : [];

  const criteriaRows = await db
    .select({
      id: scorecardCriteria.id,
      label: scorecardCriteria.label,
      description: scorecardCriteria.description,
      weight: scorecardCriteria.weight,
      orderIndex: scorecardCriteria.orderIndex,
      rating: scorecardRatings.rating,
      comment: scorecardRatings.comment,
    })
    .from(scorecardCriteria)
    .leftJoin(
      scorecardRatings,
      and(
        eq(scorecardRatings.criterionId, scorecardCriteria.id),
        row.scorecardId
          ? eq(scorecardRatings.scorecardId, row.scorecardId)
          : eq(
              scorecardRatings.scorecardId,
              "00000000-0000-0000-0000-000000000000",
            ),
      ),
    )
    .where(
      and(
        eq(scorecardCriteria.positionStageId, row.stageId),
        eq(scorecardCriteria.isActive, true),
      ),
    )
    .orderBy(asc(scorecardCriteria.orderIndex));

  return {
    applicationId: row.applicationId,
    applicationStageId: row.applicationStageId,
    candidateName: row.candidateName,
    candidateTitle: row.candidateTitle,
    positionId: row.positionId,
    positionTitle: row.positionTitle,
    stageId: row.stageId,
    stageName: row.stageName,
    stageDescription: row.stageDescription,
    scorecard: row.scorecardId
      ? {
          id: row.scorecardId,
          status: row.scorecardStatus!,
          recommendation: row.recommendation,
          strengths: row.strengths ?? "",
          concerns: row.concerns ?? "",
          notes: row.notes ?? "",
          submittedAt: row.submittedAt,
          revisionNumber: latestRevision?.revisionNumber ?? 0,
        }
      : null,
    criteria: criteriaRows.map((criterion) => ({
      ...criterion,
      rating: criterion.rating ?? null,
      comment: criterion.comment ?? "",
    })),
  };
}

/**
 * Load one submitted scorecard for its author to edit.
 *
 * Unlike the submission context, this deliberately works for a scorecard at
 * an earlier stage after the candidate moves on. The author still needs
 * application-level access, and terminal applications are never editable.
 */
export async function getScorecardEditContext(
  viewer: SessionUser,
  applicationId: string,
  scorecardId: string,
): Promise<FeedbackContext | null> {
  if (!(await canViewApplication(viewer, applicationId))) return null;

  const [row] = await db
    .select({
      applicationId: applications.id,
      applicationStageId: applicationStages.id,
      candidateName: candidates.fullName,
      candidateTitle: candidates.currentTitle,
      positionId: positions.id,
      positionTitle: positions.title,
      stageId: positionStages.id,
      stageName: positionStages.name,
      stageDescription: positionStages.description,
      scorecardId: scorecards.id,
      recommendation: scorecards.recommendation,
      strengths: scorecards.strengths,
      concerns: scorecards.concerns,
      notes: scorecards.notes,
      submittedAt: scorecards.submittedAt,
      revisionCount: scorecards.revisionCount,
    })
    .from(scorecards)
    .innerJoin(applications, eq(applications.id, scorecards.applicationId))
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(positions, eq(positions.id, applications.positionId))
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
        eq(scorecards.id, scorecardId),
        eq(scorecards.applicationId, applicationId),
        eq(scorecards.authorId, viewer.id),
        eq(scorecards.status, "submitted"),
        inArray(applications.status, ["active", "on_hold"]),
      ),
    )
    .limit(1);

  if (!row) return null;

  const criteriaRows = await db
    .select({
      id: scorecardCriteria.id,
      label: scorecardCriteria.label,
      description: scorecardCriteria.description,
      weight: scorecardCriteria.weight,
      orderIndex: scorecardCriteria.orderIndex,
      rating: scorecardRatings.rating,
      comment: scorecardRatings.comment,
    })
    .from(scorecardCriteria)
    .leftJoin(
      scorecardRatings,
      and(
        eq(scorecardRatings.criterionId, scorecardCriteria.id),
        eq(scorecardRatings.scorecardId, row.scorecardId),
      ),
    )
    .where(
      and(
        eq(scorecardCriteria.positionStageId, row.stageId),
        eq(scorecardCriteria.isActive, true),
      ),
    )
    .orderBy(asc(scorecardCriteria.orderIndex));

  return {
    applicationId: row.applicationId,
    applicationStageId: row.applicationStageId,
    candidateName: row.candidateName,
    candidateTitle: row.candidateTitle,
    positionId: row.positionId,
    positionTitle: row.positionTitle,
    stageId: row.stageId,
    stageName: row.stageName,
    stageDescription: row.stageDescription,
    scorecard: {
      id: row.scorecardId,
      status: "submitted",
      recommendation: row.recommendation,
      strengths: row.strengths ?? "",
      concerns: row.concerns ?? "",
      notes: row.notes ?? "",
      submittedAt: row.submittedAt,
      revisionNumber: row.revisionCount,
    },
    criteria: criteriaRows.map((criterion) => ({
      ...criterion,
      rating: criterion.rating ?? null,
      comment: criterion.comment ?? "",
    })),
  };
}
