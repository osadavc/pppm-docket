import "server-only";

import { and, asc, count, eq, gt } from "drizzle-orm";
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
import { evaluateStageGate, type StageGate } from "@/lib/domain/advancement";

export type AdvanceContext = {
  applicationId: string;
  candidateName: string;
  positionId: string;
  positionTitle: string;
  status: string;
  currentStage: { id: string; name: string; orderIndex: number } | null;
  /** The stage they would move to — null when they are already at the end. */
  nextStage: { id: string; name: string; orderIndex: number } | null;
  gate: StageGate;
  /** Panel members who have not submitted yet, for a useful refusal. */
  outstandingInterviewers: string[];
  isFinalStage: boolean;
};

/**
 * Everything needed to decide whether a candidate can move on, and to explain
 * the answer. Used by the UI to render the control and by the action to make
 * the decision — the action re-runs this against live rows rather than
 * trusting whatever the page was rendered with.
 */
export async function getAdvanceContext(
  applicationId: string,
): Promise<AdvanceContext | null> {
  const [row] = await db
    .select({
      applicationId: applications.id,
      status: applications.status,
      candidateName: candidates.fullName,
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
    .leftJoin(positionStages, eq(positionStages.id, applications.currentStageId))
    .where(eq(applications.id, applicationId));

  if (!row) return null;

  // The next stage is the next one still on the live pipeline — archived
  // stages are skipped over rather than advanced into.
  const nextStage = row.stageOrder === null
    ? null
    : (
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
      )[0] ?? null;

  let assignedInterviewerCount = 0;
  let submittedScorecardCount = 0;
  let outstandingInterviewers: string[] = [];

  if (row.stageId) {
    const [assigned] = await db
      .select({ n: count() })
      .from(positionStageInterviewers)
      .where(eq(positionStageInterviewers.positionStageId, row.stageId));
    assignedInterviewerCount = assigned?.n ?? 0;

    const [appStage] = await db
      .select({ id: applicationStages.id })
      .from(applicationStages)
      .where(
        and(
          eq(applicationStages.applicationId, applicationId),
          eq(applicationStages.positionStageId, row.stageId),
        ),
      );

    if (appStage) {
      const submitted = await db
        .select({ authorId: scorecards.authorId })
        .from(scorecards)
        .where(
          and(
            eq(scorecards.applicationStageId, appStage.id),
            eq(scorecards.status, "submitted"),
          ),
        );
      submittedScorecardCount = submitted.length;

      const done = new Set(submitted.map((s) => s.authorId));
      const panel = await db
        .select({ id: user.id, name: user.name })
        .from(positionStageInterviewers)
        .innerJoin(user, eq(user.id, positionStageInterviewers.userId))
        .where(eq(positionStageInterviewers.positionStageId, row.stageId))
        .orderBy(asc(user.name));
      outstandingInterviewers = panel.filter((p) => !done.has(p.id)).map((p) => p.name);
    }
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
    candidateName: row.candidateName,
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
