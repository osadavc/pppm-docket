import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  applications,
  applicationStages,
  candidates,
  positionStages,
} from "@/db/schema";
import { paceFor, type Pace } from "@/lib/domain/pace";

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
  // Archived stages are off the live pipeline, so they get no column.
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

  const rows = await db
    .select({
      applicationId: applications.id,
      candidateId: candidates.id,
      fullName: candidates.fullName,
      currentTitle: candidates.currentTitle,
      appliedAt: applications.appliedAt,
      stageId: applications.currentStageId,
      enteredAt: applicationStages.enteredAt,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
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
    )
    .orderBy(asc(applicationStages.enteredAt));

  const byStage = new Map<string, BoardCandidate[]>();
  for (const r of rows) {
    if (!r.stageId) continue;
    const list = byStage.get(r.stageId) ?? [];
    list.push({
      applicationId: r.applicationId,
      candidateId: r.candidateId,
      fullName: r.fullName,
      currentTitle: r.currentTitle,
      appliedAt: r.appliedAt,
      enteredAt: r.enteredAt,
      pace: paceFor(r.enteredAt, now),
    });
    byStage.set(r.stageId, list);
  }

  const columns: BoardColumn[] = stages.map((s) => {
    const list = byStage.get(s.id) ?? [];
    return { stageId: s.id, name: s.name, orderIndex: s.orderIndex, count: list.length, candidates: list };
  });

  return {
    columns,
    total: columns.reduce((sum, c) => sum + c.count, 0),
    stalled: columns.reduce(
      (sum, c) => sum + c.candidates.filter((x) => x.pace.level === "red").length,
      0,
    ),
  };
}
