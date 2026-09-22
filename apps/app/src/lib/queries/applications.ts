import "server-only";

import { and, asc, count, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import {
  applications,
  candidates,
  positions,
  positionStages,
} from "@/db/schema";
import { evaluateStageGate, type StageGate } from "@/lib/domain/advancement";
import { listEligiblePanelFeedback } from "@/lib/queries/stage-interviewers";
import { REJECTION_REASON_LABELS } from "@/lib/validation/application";

export type AdvanceContext = {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  positionId: string;
  positionTitle: string;
  status: string;
  currentStage: { id: string; name: string; orderIndex: number } | null;
  /** The stage they would move to, null when they are already at the end. */
  nextStage: { id: string; name: string; orderIndex: number } | null;
  gate: StageGate;
  /** Panel members who have not submitted yet, for a useful refusal. */
  outstandingInterviewers: string[];
  isFinalStage: boolean;
};

/**
 * Everything needed to decide whether a candidate can move on, and to explain
 * the answer. Used by the UI to render the control and by the action to make
 * the decision, the action re-runs this against live rows rather than
 * trusting whatever the page was rendered with.
 */
export async function getAdvanceContext(
  applicationId: string,
): Promise<AdvanceContext | null> {
  const [row] = await db
    .select({
      applicationId: applications.id,
      status: applications.status,
      candidateId: candidates.id,
      candidateName: candidates.fullName,
      candidateEmail: candidates.email,
      positionId: positions.id,
      positionTitle: positions.title,
      requireFeedbackToAdvance: positions.requireFeedbackToAdvance,
      stageId: positionStages.id,
      stageName: positionStages.name,
      stageOrder: positionStages.orderIndex,
      requiresScorecard: positionStages.requiresScorecard,
      minScorecards: positionStages.minScorecards,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(positions, eq(positions.id, applications.positionId))
    .leftJoin(
      positionStages,
      eq(positionStages.id, applications.currentStageId),
    )
    .where(eq(applications.id, applicationId));

  if (!row) return null;

  // The next stage is the next one still on the live pipeline, archived
  // stages are skipped over rather than advanced into.
  const nextStage =
    row.stageOrder === null
      ? null
      : ((
          await db
            .select({
              id: positionStages.id,
              name: positionStages.name,
              orderIndex: positionStages.orderIndex,
            })
            .from(positionStages)
            .where(
              and(
                eq(positionStages.positionId, row.positionId),
                eq(positionStages.isArchived, false),
                gt(positionStages.orderIndex, row.stageOrder),
              ),
            )
            .orderBy(asc(positionStages.orderIndex))
            .limit(1)
        )[0] ?? null);

  let assignedInterviewerCount = 0;
  let submittedScorecardCount = 0;
  let outstandingInterviewers: string[] = [];

  if (row.stageId) {
    const panel = await listEligiblePanelFeedback(applicationId, row.stageId);
    assignedInterviewerCount = panel.length;
    submittedScorecardCount = panel.filter(
      (member) => member.submittedScorecardId !== null,
    ).length;
    outstandingInterviewers = panel
      .filter((member) => member.submittedScorecardId === null)
      .map((member) => member.name);
  }

  const gate = evaluateStageGate({
    requireFeedbackToAdvance: row.requireFeedbackToAdvance,
    requiresScorecard: row.requiresScorecard ?? false,
    minScorecards: row.minScorecards ?? 0,
    assignedInterviewerCount,
    submittedScorecardCount,
  });

  return {
    applicationId: row.applicationId,
    candidateId: row.candidateId,
    candidateName: row.candidateName,
    candidateEmail: row.candidateEmail,
    positionId: row.positionId,
    positionTitle: row.positionTitle,
    status: row.status,
    currentStage: row.stageId
      ? { id: row.stageId, name: row.stageName!, orderIndex: row.stageOrder! }
      : null,
    nextStage,
    gate,
    outstandingInterviewers,
    isFinalStage: row.stageId !== null && nextStage === null,
  };
}

export type RejectionBreakdownRow = {
  reason: string;
  label: string;
  count: number;
};

/**
 * Drop-out analysis for a position. Possible only because the reason is an
 * enum column, this is the payoff for not storing it as free text.
 */
export async function getRejectionBreakdown(
  positionId: string,
): Promise<RejectionBreakdownRow[]> {
  const rows = await db
    .select({ reason: applications.rejectionReason, n: count() })
    .from(applications)
    .where(
      and(
        eq(applications.positionId, positionId),
        eq(applications.status, "rejected"),
      ),
    )
    .groupBy(applications.rejectionReason);

  return rows
    .filter((r) => r.reason !== null)
    .map((r) => ({
      reason: r.reason!,
      label: REJECTION_REASON_LABELS[r.reason!],
      count: r.n,
    }))
    .sort((a, b) => b.count - a.count);
}
