import "server-only";

import { and, asc, count, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { applications, positions, positionStages } from "@/db/schema";
import type { PositionStatus } from "@/db/schema/enums";

/**
 * Statuses a candidate is allowed to see. `draft` is absent by construction,
 * and this constant is the single place that decision is expressed.
 */
export const PUBLIC_POSITION_STATUSES = ["open"] as const satisfies readonly PositionStatus[];

/**
 * The ONLY query a public careers board may use.
 *
 * Drafts are excluded here rather than in a page filter, so a future public
 * page cannot leak them by forgetting a `where` clause. There is no public
 * board yet — this exists so the guarantee lands with the draft story rather
 * than being retrofitted later.
 */
export async function listPublicPositions() {
  return db
    .select({
      id: positions.id,
      title: positions.title,
      department: positions.department,
      location: positions.location,
      employmentType: positions.employmentType,
      description: positions.description,
      applicationDeadline: positions.applicationDeadline,
      openedAt: positions.openedAt,
    })
    .from(positions)
    .where(eq(positions.status, "open"))
    .orderBy(desc(positions.openedAt));
}

export type PositionListItem = {
  id: string;
  title: string;
  department: string;
  location: string | null;
  status: PositionStatus;
  openings: number;
  applicationDeadline: Date | null;
  createdAt: Date;
  stageCount: number;
  candidateCount: number;
};

/** Internal listing — staff only, includes drafts. */
export async function listPositions(): Promise<PositionListItem[]> {
  const rows = await db
    .select({
      id: positions.id,
      title: positions.title,
      department: positions.department,
      location: positions.location,
      status: positions.status,
      openings: positions.openings,
      applicationDeadline: positions.applicationDeadline,
      createdAt: positions.createdAt,
      stageCount: sql<number>`(
        select count(*)::int from ${positionStages}
        where ${positionStages.positionId} = ${positions.id}
      )`,
      candidateCount: sql<number>`(
        select count(*)::int from ${applications}
        where ${applications.positionId} = ${positions.id}
      )`,
    })
    .from(positions)
    .orderBy(desc(positions.createdAt));

  return rows;
}

export async function getPosition(positionId: string) {
  return db.query.positions.findFirst({
    where: eq(positions.id, positionId),
    with: {
      stages: {
        orderBy: asc(positionStages.orderIndex),
        with: { criteria: true },
      },
      hiringManager: { columns: { id: true, name: true, email: true } },
      createdBy: { columns: { id: true, name: true } },
    },
  });
}

/** True once anyone has applied — used to protect stages from destructive edits. */
export async function positionHasApplications(positionId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(applications)
    .where(eq(applications.positionId, positionId));
  return (row?.n ?? 0) > 0;
}

export async function countNonDraftPositions() {
  const [row] = await db
    .select({ n: count() })
    .from(positions)
    .where(and(ne(positions.status, "draft")));
  return row?.n ?? 0;
}
