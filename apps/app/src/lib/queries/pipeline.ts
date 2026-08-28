import "server-only";

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  applications,
  applicationStages,
  candidates,
  positionStages,
} from "@/db/schema";
import { PACE_THRESHOLDS, paceFor, type Pace } from "@/lib/domain/pace";

/**
 * A board is an at-a-glance view. Keep its response bounded even when a stage
 * contains thousands of candidates; the paginated candidate list exposes the
 * complete stage when needed.
 */
export const PIPELINE_CARDS_PER_STAGE = 25;

export type BoardCandidate = {
  applicationId: string;
  candidateId: string;
  fullName: string;
  currentTitle: string | null;
  appliedAt: Date;
  /** When they entered THIS stage — the basis for time-in-stage. */
  enteredAt: Date | null;
  pace: Pace;
};

export type BoardColumn = {
  stageId: string;
  name: string;
  orderIndex: number;
  count: number;
  candidates: BoardCandidate[];
};

/**
 * The pipeline board.
 *
 * Time in stage is measured from `application_stages.enteredAt` for the stage
 * the candidate is *currently* on — not from `appliedAt` — which is what makes
 * the clock reset on every move: entering a stage stamps a fresh enteredAt, so
 * the figure shown is always "how long since they last moved".
 */
export async function getPipelineBoard(positionId: string, now: Date = new Date()) {
  // `paceFor` turns six whole elapsed days into red. Mirror that boundary in
  // SQL so the alert is counted across the full stage, not only loaded cards.
  const stalledSince = new Date(
    now.getTime() - PACE_THRESHOLDS.redFrom * 24 * 60 * 60 * 1000,
  );

  // Archived stages are off the live pipeline, so they get no column.
  const stagesQuery = db
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

  // Window functions compute the complete per-stage counts before the outer
  // query applies its cap. This keeps both the HTML payload and React work
  // bounded without making stage badges (or the stalled alert) inaccurate.
  const rankedCandidates = db.$with("ranked_pipeline_candidates").as(
    db
    .select({
      applicationId: applications.id,
      candidateId: candidates.id,
      fullName: candidates.fullName,
      currentTitle: candidates.currentTitle,
      appliedAt: applications.appliedAt,
      stageId: applications.currentStageId,
      enteredAt: applicationStages.enteredAt,
      count: sql<number>`count(*) over (partition by ${applications.currentStageId})::int`.as(
        "count",
      ),
      stalled: sql<number>`count(*) filter (where ${applicationStages.enteredAt} <= ${stalledSince}) over (partition by ${applications.currentStageId})::int`.as(
        "stalled",
      ),
      rank: sql<number>`row_number() over (partition by ${applications.currentStageId} order by ${applicationStages.enteredAt} asc, ${applications.id} asc)::int`.as(
        "rank",
      ),
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    // This also excludes candidates stranded on an archived stage, matching
    // the old board's live-column semantics.
    .innerJoin(
      positionStages,
      and(
        eq(positionStages.id, applications.currentStageId),
        eq(positionStages.positionId, positionId),
        eq(positionStages.isArchived, false),
      ),
    )
    // Join to the row for the stage they are on right now, so enteredAt is
    // that stage's, not the first stage's.
    .leftJoin(
      applicationStages,
      and(
        eq(applicationStages.applicationId, applications.id),
        eq(applicationStages.positionStageId, applications.currentStageId),
      ),
    )
    .where(
      and(eq(applications.positionId, positionId), eq(applications.status, "active")),
    ),
  );

  const candidatesQuery = db
    .with(rankedCandidates)
    .select({
      applicationId: rankedCandidates.applicationId,
      candidateId: rankedCandidates.candidateId,
      fullName: rankedCandidates.fullName,
      currentTitle: rankedCandidates.currentTitle,
      appliedAt: rankedCandidates.appliedAt,
      stageId: rankedCandidates.stageId,
      enteredAt: rankedCandidates.enteredAt,
      count: rankedCandidates.count,
      stalled: rankedCandidates.stalled,
      rank: rankedCandidates.rank,
    })
    .from(rankedCandidates)
    .where(lte(rankedCandidates.rank, PIPELINE_CARDS_PER_STAGE))
    .orderBy(asc(rankedCandidates.stageId), asc(rankedCandidates.rank));

  const [stages, rows] = await Promise.all([stagesQuery, candidatesQuery]);

  const byStage = new Map<
    string,
    { candidates: BoardCandidate[]; count: number; stalled: number }
  >();
  for (const r of rows) {
    if (!r.stageId) continue;
    const stage = byStage.get(r.stageId) ?? {
      candidates: [],
      count: Number(r.count),
      stalled: Number(r.stalled),
    };
    stage.candidates.push({
      applicationId: r.applicationId,
      candidateId: r.candidateId,
      fullName: r.fullName,
      currentTitle: r.currentTitle,
      appliedAt: r.appliedAt,
      enteredAt: r.enteredAt,
      pace: paceFor(r.enteredAt, now),
    });
    byStage.set(r.stageId, stage);
  }

  const columns: BoardColumn[] = stages.map((s) => {
    const stage = byStage.get(s.id);
    return {
      stageId: s.id,
      name: s.name,
      orderIndex: s.orderIndex,
      count: stage?.count ?? 0,
      candidates: stage?.candidates ?? [],
    };
  });

  return {
    columns,
    total: columns.reduce((sum, c) => sum + c.count, 0),
    stalled: [...byStage.values()].reduce((sum, stage) => sum + stage.stalled, 0),
  };
}
