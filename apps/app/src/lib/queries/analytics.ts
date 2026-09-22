import "server-only";

import { and, asc, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { applications, applicationStages, positions, positionStages } from "@/db/schema";
import { REJECTION_REASON_LABELS } from "@/lib/validation/application";

export type Kpis = {
  openPositions: number;
  activeCandidates: number;
  hired: number;
  /** Mean of decision_at − applied_at over hired applications, in days; null when none. */
  averageTimeToHireDays: number | null;
};

/** Four headline numbers in two statements, no rows are loaded to be counted. */
export async function getKpis(): Promise<Kpis> {
  const [[positionRow], [applicationRow]] = await Promise.all([
    db
      .select({ open: count() })
      .from(positions)
      .where(eq(positions.status, "open")),
    db
      .select({
        active: sql<number>`count(*) filter (where ${applications.status} = 'active')::int`,
        hired: sql<number>`count(*) filter (where ${applications.status} = 'hired')::int`,
        avgDays: sql<number | null>`avg(
          extract(epoch from (${applications.decisionAt} - ${applications.appliedAt})) / 86400
        ) filter (where ${applications.status} = 'hired' and ${applications.decisionAt} is not null)`,
      })
      .from(applications),
  ]);

  return {
    openPositions: positionRow?.open ?? 0,
    activeCandidates: applicationRow?.active ?? 0,
    hired: applicationRow?.hired ?? 0,
    averageTimeToHireDays:
      applicationRow?.avgDays === null || applicationRow?.avgDays === undefined
        ? null
        : Number(applicationRow.avgDays),
  };
}

export type FunnelBar = { stageId: string | null; label: string; count: number };
export type PositionFunnel = {
  positionId: string;
  title: string;
  status: string;
  bars: FunnelBar[];
};

/**
 * One funnel per open or filled position: how many applications ever entered
 * each live stage (`entered_at is not null`), then a trailing Hired bar. Two
 * grouped queries for every position at once.
 */
export async function getStageFunnels(): Promise<PositionFunnel[]> {
  const scope = inArray(positions.status, ["open", "filled"]);
  const [stageRows, hiredRows] = await Promise.all([
    db
      .select({
        positionId: positions.id,
        title: positions.title,
        status: positions.status,
        stageId: positionStages.id,
        stageName: positionStages.name,
        orderIndex: positionStages.orderIndex,
        entered: sql<number>`count(${applicationStages.id}) filter (where ${applicationStages.enteredAt} is not null)::int`,
      })
      .from(positions)
      .innerJoin(
        positionStages,
        and(eq(positionStages.positionId, positions.id), eq(positionStages.isArchived, false)),
      )
      .leftJoin(applicationStages, eq(applicationStages.positionStageId, positionStages.id))
      .where(scope)
      .groupBy(positions.id, positionStages.id)
      .orderBy(desc(positions.openedAt), asc(positions.title), asc(positionStages.orderIndex)),
    db
      .select({ positionId: applications.positionId, hired: count() })
      .from(applications)
      .innerJoin(positions, eq(positions.id, applications.positionId))
      .where(and(scope, eq(applications.status, "hired")))
      .groupBy(applications.positionId),
  ]);

  const hiredBy = new Map(hiredRows.map((r) => [r.positionId, r.hired]));
  const funnels = new Map<string, PositionFunnel>();
  for (const row of stageRows) {
    const funnel =
      funnels.get(row.positionId) ??
      { positionId: row.positionId, title: row.title, status: row.status, bars: [] };
    funnel.bars.push({ stageId: row.stageId, label: row.stageName, count: row.entered });
    funnels.set(row.positionId, funnel);
  }
  for (const funnel of funnels.values()) {
    funnel.bars.push({ stageId: null, label: "Hired", count: hiredBy.get(funnel.positionId) ?? 0 });
  }
  return [...funnels.values()];
}

export type DropoutReason = { reason: string; label: string; count: number };

/** Rejections across every position, grouped by the enum reason. */
export async function getDropoutReasons(): Promise<DropoutReason[]> {
  const rows = await db
    .select({ reason: applications.rejectionReason, n: count() })
    .from(applications)
    .where(and(eq(applications.status, "rejected"), isNotNull(applications.rejectionReason)))
    .groupBy(applications.rejectionReason);
  return rows
    .filter((r): r is { reason: NonNullable<typeof r.reason>; n: number } => r.reason !== null)
    .map((r) => ({ reason: r.reason, label: REJECTION_REASON_LABELS[r.reason], count: r.n }))
    .sort((a, b) => b.count - a.count);
}

export type TimeToFillRow = {
  positionId: string;
  title: string;
  openedAt: Date | null;
  closedAt: Date | null;
  /** closed_at − opened_at in whole days; null when either is missing. */
  days: number | null;
};

export async function getTimeToFill(): Promise<TimeToFillRow[]> {
  const rows = await db
    .select({
      positionId: positions.id,
      title: positions.title,
      openedAt: positions.openedAt,
      closedAt: positions.closedAt,
      days: sql<number | null>`
        case when ${positions.openedAt} is null or ${positions.closedAt} is null then null
        else floor(extract(epoch from (${positions.closedAt} - ${positions.openedAt})) / 86400)::int end`,
    })
    .from(positions)
    .where(eq(positions.status, "filled"))
    .orderBy(desc(positions.closedAt));
  return rows.map((r) => ({ ...r, days: r.days === null ? null : Number(r.days) }));
}
