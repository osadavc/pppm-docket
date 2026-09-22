import "server-only";

import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import { db } from "@/db/client";
import {
  applications,
  applicationStages,
  attachments,
  candidates,
  positions,
  applicationStagePanels,
  positionStages,
  scorecards,
  user,
} from "@/db/schema";
import { evaluateStageGate, type StageGate } from "@/lib/domain/advancement";
import { paceFor, type Pace } from "@/lib/domain/pace";

export const QUEUE_PAGE_SIZE = 50;

export type QueueCandidate = {
  applicationId: string;
  applicationStageId: string;
  candidateName: string;
  candidateTitle: string | null;
  positionTitle: string;
  stageName: string;
  enteredAt: Date | null;
  pace: Pace;
  feedbackStatus: "awaiting" | "submitted";
  gate: StageGate;
  /** Opaque database id only; the queue never receives a storage path or URL. */
  cvAttachmentId: string | null;
};

export type MyQueuePage = {
  awaiting: QueueCandidate[];
  submitted: QueueCandidate[];
  summary: {
    awaiting: number;
    submitted: number;
    total: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
  };
};

/**
 * The viewer's bounded, live assessment queue.
 *
 * Assignment, active application state, and current-stage matching are all
 * enforced in SQL. Results are ordered by personal feedback state and then by
 * time in stage, so each rendered section is oldest-first across positions.
 */
export async function getMyQueue(
  userId: string,
  requestedPage = 1,
  now: Date = new Date(),
): Promise<MyQueuePage> {
  const safePage =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const baseWhere = and(
    eq(applications.status, "active"),
    eq(applicationStagePanels.userId, userId),
  );

  const [totals] = await db
    .select({
      total: count(),
      submitted: count(scorecards.id),
    })
    .from(applications)
    .innerJoin(
      applicationStages,
      and(
        eq(applicationStages.applicationId, applications.id),
        eq(applicationStages.positionStageId, applications.currentStageId),
      ),
    )
    .innerJoin(
      applicationStagePanels,
      eq(applicationStagePanels.applicationStageId, applicationStages.id),
    )
    .leftJoin(
      scorecards,
      and(
        eq(scorecards.applicationStageId, applicationStages.id),
        eq(scorecards.authorId, userId),
        eq(scorecards.status, "submitted"),
      ),
    )
    .where(baseWhere);

  const total = totals?.total ?? 0;
  const submittedTotal = totals?.submitted ?? 0;
  const awaitingTotal = Math.max(0, total - submittedTotal);
  const totalPages = Math.max(1, Math.ceil(total / QUEUE_PAGE_SIZE));
  const page = Math.min(safePage, totalPages);

  const rows =
    total === 0
      ? []
      : await db
          .select({
            applicationId: applications.id,
            applicationStageId: applicationStages.id,
            candidateName: candidates.fullName,
            candidateTitle: candidates.currentTitle,
            positionTitle: positions.title,
            requireFeedbackToAdvance: positions.requireFeedbackToAdvance,
            stageName: positionStages.name,
            requiresScorecard: positionStages.requiresScorecard,
            minScorecards: positionStages.minScorecards,
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
            applicationStages,
            and(
              eq(applicationStages.applicationId, applications.id),
              eq(applicationStages.positionStageId, positionStages.id),
            ),
          )
          .innerJoin(
            applicationStagePanels,
            eq(applicationStagePanels.applicationStageId, applicationStages.id),
          )
          .leftJoin(
            scorecards,
            and(
              eq(scorecards.applicationStageId, applicationStages.id),
              eq(scorecards.authorId, userId),
              eq(scorecards.status, "submitted"),
            ),
          )
          .where(baseWhere)
          .orderBy(
            // false (awaiting) sorts before true (submitted).
            asc(sql`${scorecards.id} is not null`),
            sql`${applicationStages.enteredAt} asc nulls first`,
            asc(candidates.fullName),
          )
          .limit(QUEUE_PAGE_SIZE)
          .offset((page - 1) * QUEUE_PAGE_SIZE);

  const applicationStageIds = rows.map((row) => row.applicationStageId);
  const applicationIds = rows.map((row) => row.applicationId);

  const [panelRows, cvRows] = await Promise.all([
    applicationStageIds.length === 0
      ? []
      : db
          .select({
            applicationStageId: applicationStages.id,
            assignedInterviewerCount: countDistinct(
              applicationStagePanels.userId,
            ),
            submittedScorecardCount: countDistinct(scorecards.id),
          })
          .from(applicationStages)
          .innerJoin(
            applicationStagePanels,
            eq(applicationStagePanels.applicationStageId, applicationStages.id),
          )
          .innerJoin(
            user,
            and(
              eq(user.id, applicationStagePanels.userId),
              eq(user.isActive, true),
            ),
          )
          .leftJoin(
            scorecards,
            and(
              eq(scorecards.applicationStageId, applicationStages.id),
              eq(scorecards.authorId, applicationStagePanels.userId),
              eq(scorecards.status, "submitted"),
            ),
          )
          .where(inArray(applicationStages.id, applicationStageIds))
          .groupBy(applicationStages.id),
    applicationIds.length === 0
      ? []
      : db
          .select({
            id: attachments.id,
            applicationId: attachments.applicationId,
          })
          .from(attachments)
          .where(
            and(
              inArray(attachments.applicationId, applicationIds),
              eq(attachments.kind, "cv"),
            ),
          )
          .orderBy(desc(attachments.createdAt)),
  ]);

  const panelByApplicationStage = new Map(
    panelRows.map((row) => [row.applicationStageId, row]),
  );
  const cvByApplication = new Map<string, string>();
  for (const cv of cvRows) {
    if (cv.applicationId && !cvByApplication.has(cv.applicationId)) {
      cvByApplication.set(cv.applicationId, cv.id);
    }
  }

  const candidatesOnPage = rows.map((row): QueueCandidate => {
    const panel = panelByApplicationStage.get(row.applicationStageId);
    const gate = evaluateStageGate({
      requireFeedbackToAdvance: row.requireFeedbackToAdvance,
      requiresScorecard: row.requiresScorecard,
      minScorecards: row.minScorecards,
      assignedInterviewerCount: panel?.assignedInterviewerCount ?? 0,
      submittedScorecardCount: panel?.submittedScorecardCount ?? 0,
    });

    return {
      applicationId: row.applicationId,
      applicationStageId: row.applicationStageId,
      candidateName: row.candidateName,
      candidateTitle: row.candidateTitle,
      positionTitle: row.positionTitle,
      stageName: row.stageName,
      enteredAt: row.enteredAt,
      pace: paceFor(row.enteredAt, now),
      feedbackStatus: row.submittedScorecardId ? "submitted" : "awaiting",
      gate,
      cvAttachmentId: cvByApplication.get(row.applicationId) ?? null,
    };
  });

  return {
    awaiting: candidatesOnPage.filter(
      (candidate) => candidate.feedbackStatus === "awaiting",
    ),
    submitted: candidatesOnPage.filter(
      (candidate) => candidate.feedbackStatus === "submitted",
    ),
    summary: {
      awaiting: awaitingTotal,
      submitted: submittedTotal,
      total,
    },
    pagination: { page, pageSize: QUEUE_PAGE_SIZE, totalPages },
  };
}

/** Count only active, current-stage assignments without fetching queue rows. */
export async function countOutstandingFeedback(userId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(applications)
    .innerJoin(
      applicationStages,
      and(
        eq(applicationStages.applicationId, applications.id),
        eq(applicationStages.positionStageId, applications.currentStageId),
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
        eq(scorecards.status, "submitted"),
      ),
    )
    .where(and(eq(applications.status, "active"), isNull(scorecards.id)));

  return row?.total ?? 0;
}
