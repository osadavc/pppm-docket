import "server-only";

import { and, asc, count, desc, eq, inArray, lte, sql } from "drizzle-orm";
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
import { evaluateStageGate, type StageGate } from "@/lib/domain/advancement";
import { PACE_THRESHOLDS, paceFor, type Pace } from "@/lib/domain/pace";

/** Cards loaded per column; totals are counted separately and stay exact. */
export const BOARD_CARDS_PER_STAGE = 8;

export type BoardCandidate = {
  applicationId: string;
  candidateId: string;
  fullName: string;
  currentTitle: string | null;
  appliedAt: Date;
  /** When they entered THIS stage, the basis for time-in-stage. */
  enteredAt: Date | null;
  pace: Pace;
};

export type BoardColumn = {
  stageId: string;
  name: string;
  orderIndex: number;
  /** Everyone active on this stage, whether or not their card was loaded. */
  count: number;
  candidates: BoardCandidate[];
};

export type PipelineBoard = {
  columns: BoardColumn[];
  /** Active applications on live stages. */
  total: number;
  /** Active applications past the red threshold in their current stage. */
  stalled: number;
  resolved: { hired: number; onHold: number; rejected: number };
  firstStage: { id: string; name: string; reviewable: number } | null;
};

/** The `entered_at` at or before which a candidate counts as stalled today. */
export function stalledBefore(now: Date) {
  return new Date(now.getTime() - PACE_THRESHOLDS.redFrom * 24 * 60 * 60 * 1000);
}

/**
 * The pipeline board, bounded.
 *
 * Cards are windowed in SQL, `row_number() over (partition by stage order by
 * entered_at)`, so a position with 1,000 applicants sends at most
 * 8 × stages rows over the wire. Every number on the page comes from a
 * grouped `count(*)` that never looks at the loaded cards, so the totals are
 * exact whatever the window holds. Archived stages get no column and no
 * count; on-hold candidates are out of the running and appear only in the
 * resolved strip.
 *
 * Time in stage is measured from `application_stages.entered_at` for the
 * stage the candidate is *currently* on, which is what makes the clock reset
 * on every move.
 */
export async function getPipelineBoard(
  positionId: string,
  now: Date = new Date(),
): Promise<PipelineBoard> {
  const stages = await db
    .select({
      id: positionStages.id,
      name: positionStages.name,
      orderIndex: positionStages.orderIndex,
    })
    .from(positionStages)
    .where(
      and(
        eq(positionStages.positionId, positionId),
        eq(positionStages.isArchived, false),
      ),
    )
    .orderBy(asc(positionStages.orderIndex));

  const liveStageIds = stages.map((s) => s.id);
  if (liveStageIds.length === 0) {
    const resolved = await resolvedCounts(positionId);
    return { columns: [], total: 0, stalled: 0, resolved, firstStage: null };
  }

  const onLiveStage = and(
    eq(applications.positionId, positionId),
    eq(applications.status, "active"),
    inArray(applications.currentStageId, liveStageIds),
  );

  // Every column is aliased: a subquery with two bare "id"s is ambiguous.
  const windowed = db
    .select({
      applicationId: sql<string>`${applications.id}`.as("application_id"),
      candidateId: sql<string>`${candidates.id}`.as("candidate_id"),
      fullName: sql<string>`${candidates.fullName}`.as("full_name"),
      currentTitle: sql<string | null>`${candidates.currentTitle}`.as("current_title"),
      // Raw-aliased timestamps arrive as strings; converted below.
      appliedAt: sql<string>`${applications.appliedAt}`.as("applied_at"),
      stageId: sql<string | null>`${applications.currentStageId}`.as("stage_id"),
      enteredAt: sql<string | null>`${applicationStages.enteredAt}`.as("entered_at"),
      rank: sql<number>`row_number() over (
        partition by ${applications.currentStageId}
        order by ${applicationStages.enteredAt} asc nulls first, ${applications.appliedAt} asc
      )`.as("rank"),
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    // The row for the stage they are on right now, so enteredAt is that
    // stage's, not the first stage's.
    .leftJoin(
      applicationStages,
      and(
        eq(applicationStages.applicationId, applications.id),
        eq(applicationStages.positionStageId, applications.currentStageId),
      ),
    )
    .where(onLiveStage)
    .as("windowed");

  const [cards, perStage, [stalledRow], resolved] = await Promise.all([
    db
      .select()
      .from(windowed)
      .where(lte(windowed.rank, BOARD_CARDS_PER_STAGE))
      .orderBy(asc(windowed.rank)),
    db
      .select({ stageId: applications.currentStageId, n: count() })
      .from(applications)
      .where(onLiveStage)
      .groupBy(applications.currentStageId),
    db
      .select({ n: count() })
      .from(applications)
      .innerJoin(
        applicationStages,
        and(
          eq(applicationStages.applicationId, applications.id),
          eq(applicationStages.positionStageId, applications.currentStageId),
        ),
      )
      .where(and(onLiveStage, lte(applicationStages.enteredAt, stalledBefore(now)))),
    resolvedCounts(positionId),
  ]);

  const countByStage = new Map(perStage.map((r) => [r.stageId, r.n]));
  const byStage = new Map<string, BoardCandidate[]>();
  for (const r of cards) {
    if (!r.stageId) continue;
    const list = byStage.get(r.stageId) ?? [];
    const enteredAt = r.enteredAt ? new Date(r.enteredAt) : null;
    list.push({
      applicationId: r.applicationId,
      candidateId: r.candidateId,
      fullName: r.fullName,
      currentTitle: r.currentTitle,
      appliedAt: new Date(r.appliedAt),
      enteredAt,
      pace: paceFor(enteredAt, now),
    });
    byStage.set(r.stageId, list);
  }

  const columns: BoardColumn[] = stages.map((s) => ({
    stageId: s.id,
    name: s.name,
    orderIndex: s.orderIndex,
    count: countByStage.get(s.id) ?? 0,
    candidates: byStage.get(s.id) ?? [],
  }));

  const first = stages[0]!;
  return {
    columns,
    total: perStage.reduce((sum, r) => sum + r.n, 0),
    stalled: stalledRow?.n ?? 0,
    resolved,
    firstStage: {
      id: first.id,
      name: first.name,
      reviewable: countByStage.get(first.id) ?? 0,
    },
  };
}

async function resolvedCounts(positionId: string) {
  const rows = await db
    .select({ status: applications.status, n: count() })
    .from(applications)
    .where(
      and(
        eq(applications.positionId, positionId),
        inArray(applications.status, ["hired", "on_hold", "rejected"]),
      ),
    )
    .groupBy(applications.status);
  const by = new Map(rows.map((r) => [r.status, r.n]));
  return {
    hired: by.get("hired") ?? 0,
    onHold: by.get("on_hold") ?? 0,
    rejected: by.get("rejected") ?? 0,
  };
}

/** Cards loaded into the screening workspace at once. */
export const REVIEW_QUEUE_LIMIT = 25;

export type ReviewCard = {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string | null;
  currentTitle: string | null;
  appliedAt: Date;
  /** Only filled for viewers who may see it; null otherwise. */
  salaryExpectation: string | null;
  cv: { attachmentId: string; fileName: string; mimeType: string } | null;
  gate: StageGate;
  outstandingInterviewers: string[];
};

export type ReviewQueue = {
  position: { id: string; title: string; status: string };
  stage: { id: string; name: string; orderIndex: number } | null;
  nextStage: { id: string; name: string; orderIndex: number } | null;
  cards: ReviewCard[];
  /** Everyone active at the first stage, independent of the loaded cards. */
  total: number;
};

/**
 * The first-stage screening queue: active applications at the first live
 * stage, oldest applied first, bounded to a page of cards. The gate for each
 * card is computed from one grouped query over the stage's panel rather than
 * one round trip per candidate.
 */
export async function getReviewQueue(
  positionId: string,
  options: { includeSalary: boolean; limit?: number } = { includeSalary: false },
): Promise<ReviewQueue | null> {
  const limit = options.limit ?? REVIEW_QUEUE_LIMIT;
  const [position] = await db
    .select({
      id: positions.id,
      title: positions.title,
      status: positions.status,
      requireFeedbackToAdvance: positions.requireFeedbackToAdvance,
    })
    .from(positions)
    .where(eq(positions.id, positionId));
  if (!position) return null;

  const live = await db
    .select({
      id: positionStages.id,
      name: positionStages.name,
      orderIndex: positionStages.orderIndex,
      requiresScorecard: positionStages.requiresScorecard,
      minScorecards: positionStages.minScorecards,
    })
    .from(positionStages)
    .where(
      and(
        eq(positionStages.positionId, positionId),
        eq(positionStages.isArchived, false),
      ),
    )
    .orderBy(asc(positionStages.orderIndex))
    .limit(2);
  const stage = live[0] ?? null;
  const nextStage = live[1] ?? null;
  const base = { position, stage, nextStage };
  if (!stage) return { ...base, cards: [], total: 0 };

  const atFirstStage = and(
    eq(applications.positionId, positionId),
    eq(applications.status, "active"),
    eq(applications.currentStageId, stage.id),
  );

  const [[totalRow], rows, panel] = await Promise.all([
    db.select({ n: count() }).from(applications).where(atFirstStage),
    db
      .select({
        applicationId: applications.id,
        applicationStageId: applicationStages.id,
        candidateId: candidates.id,
        candidateName: candidates.fullName,
        candidateEmail: candidates.email,
        candidatePhone: candidates.phone,
        currentTitle: candidates.currentTitle,
        appliedAt: applications.appliedAt,
        salaryExpectation: applications.salaryExpectation,
      })
      .from(applications)
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .innerJoin(
        applicationStages,
        and(
          eq(applicationStages.applicationId, applications.id),
          eq(applicationStages.positionStageId, stage.id),
        ),
      )
      .where(atFirstStage)
      .orderBy(asc(applications.appliedAt), asc(candidates.fullName))
      .limit(limit),
    // The standing panel for this stage, once; who has submitted is then a
    // per-card lookup against the loaded rows.
    db
      .select({ userId: user.id, name: user.name })
      .from(positionStageInterviewers)
      .innerJoin(
        user,
        and(eq(user.id, positionStageInterviewers.userId), eq(user.isActive, true)),
      )
      .where(eq(positionStageInterviewers.positionStageId, stage.id))
      .orderBy(asc(user.name)),
  ]);

  const applicationStageIds = rows.map((r) => r.applicationStageId);
  const applicationIds = rows.map((r) => r.applicationId);
  const [submitted, cvs] =
    rows.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({
              applicationStageId: scorecards.applicationStageId,
              authorId: scorecards.authorId,
            })
            .from(scorecards)
            .where(
              and(
                inArray(scorecards.applicationStageId, applicationStageIds),
                eq(scorecards.status, "submitted"),
              ),
            ),
          db
            .select({
              id: attachments.id,
              applicationId: attachments.applicationId,
              fileName: attachments.fileName,
              mimeType: attachments.mimeType,
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

  const submittedBy = new Map<string, Set<string>>();
  for (const s of submitted) {
    const set = submittedBy.get(s.applicationStageId) ?? new Set();
    set.add(s.authorId);
    submittedBy.set(s.applicationStageId, set);
  }
  const cvByApplication = new Map<string, (typeof cvs)[number]>();
  for (const cv of cvs) {
    if (cv.applicationId && !cvByApplication.has(cv.applicationId)) {
      cvByApplication.set(cv.applicationId, cv);
    }
  }

  const cards: ReviewCard[] = rows.map((r) => {
    const done = submittedBy.get(r.applicationStageId) ?? new Set<string>();
    const outstanding = panel.filter((m) => !done.has(m.userId)).map((m) => m.name);
    const cv = cvByApplication.get(r.applicationId);
    return {
      applicationId: r.applicationId,
      candidateId: r.candidateId,
      candidateName: r.candidateName,
      candidateEmail: r.candidateEmail,
      candidatePhone: r.candidatePhone,
      currentTitle: r.currentTitle,
      appliedAt: r.appliedAt,
      salaryExpectation: options.includeSalary ? r.salaryExpectation : null,
      cv: cv ? { attachmentId: cv.id, fileName: cv.fileName, mimeType: cv.mimeType } : null,
      gate: evaluateStageGate({
        requireFeedbackToAdvance: position.requireFeedbackToAdvance,
        requiresScorecard: stage.requiresScorecard,
        minScorecards: stage.minScorecards,
        assignedInterviewerCount: panel.length,
        submittedScorecardCount: panel.length - outstanding.length,
      }),
      outstandingInterviewers: outstanding,
    };
  });

  return { ...base, cards, total: totalRow?.n ?? 0 };
}
