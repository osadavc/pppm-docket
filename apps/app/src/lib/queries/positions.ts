import "server-only";

import { and, asc, count, desc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { applications, positions, positionStages, user } from "@/db/schema";
import type { PositionStatus } from "@/db/schema/enums";

/**
 * The status a candidate is allowed to see. Kept in lib/domain/position-status
 * so the careers queries and the "accepts applications" rule cannot drift — a
 * role must never be advertised somewhere it cannot be applied to.
 */
const PUBLIC_STATUS = "open" as const satisfies PositionStatus;

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
    .where(eq(positions.status, PUBLIC_STATUS))
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
      submittedBy: { columns: { id: true, name: true } },
      reviewedBy: { columns: { id: true, name: true } },
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

export type PendingApproval = {
  id: string;
  title: string;
  department: string;
  location: string | null;
  openings: number;
  applicationDeadline: Date | null;
  submittedAt: Date | null;
  submittedByName: string | null;
  hiringManagerId: string | null;
  hiringManagerName: string | null;
  stageCount: number;
};

/**
 * The management approval queue: every position awaiting sign-off, oldest
 * submission first so nothing sits forgotten at the bottom.
 */
export async function listPendingApprovals(): Promise<PendingApproval[]> {
  const submitter = alias(user, "submitter");
  const manager = alias(user, "manager");

  return db
    .select({
      id: positions.id,
      title: positions.title,
      department: positions.department,
      location: positions.location,
      openings: positions.openings,
      applicationDeadline: positions.applicationDeadline,
      submittedAt: positions.submittedAt,
      submittedByName: submitter.name,
      hiringManagerId: positions.hiringManagerId,
      hiringManagerName: manager.name,
      stageCount: sql<number>`(
        select count(*)::int from ${positionStages}
        where ${positionStages.positionId} = ${positions.id}
      )`,
    })
    .from(positions)
    .leftJoin(submitter, eq(submitter.id, positions.submittedById))
    .leftJoin(manager, eq(manager.id, positions.hiringManagerId))
    .where(eq(positions.status, "pending_approval"))
    .orderBy(asc(positions.submittedAt));
}

export async function countPendingApprovals() {
  const [row] = await db
    .select({ n: count() })
    .from(positions)
    .where(eq(positions.status, "pending_approval"));
  return row?.n ?? 0;
}

/**
 * Single-role view for the public careers board. Scoped to `open` for the same
 * reason as the listing: an unapproved role must not be reachable by guessing
 * its id.
 */
export async function getPublicPosition(positionId: string) {
  const [row] = await db
    .select({
      id: positions.id,
      title: positions.title,
      department: positions.department,
      location: positions.location,
      employmentType: positions.employmentType,
      description: positions.description,
      requirements: positions.requirements,
      applicationDeadline: positions.applicationDeadline,
    })
    .from(positions)
    .where(and(eq(positions.id, positionId), eq(positions.status, PUBLIC_STATUS)))
    .limit(1);
  return row ?? null;
}

export type FillSummary = {
  openings: number;
  hired: number;
  shortfall: number;
  activeCandidates: number;
};

/**
 * Powers the under-hire warning when closing a position. Counting `hired`
 * applications rather than trusting a flag means the warning reflects what
 * actually happened in the pipeline.
 */
export async function getFillSummary(positionId: string): Promise<FillSummary> {
  const [position] = await db
    .select({ openings: positions.openings })
    .from(positions)
    .where(eq(positions.id, positionId));

  const [counts] = await db
    .select({
      hired: sql<number>`count(*) filter (where ${applications.status} = 'hired')::int`,
      active: sql<number>`count(*) filter (where ${applications.status} = 'active')::int`,
    })
    .from(applications)
    .where(eq(applications.positionId, positionId));

  const openings = position?.openings ?? 0;
  const hired = counts?.hired ?? 0;

  return {
    openings,
    hired,
    shortfall: Math.max(0, openings - hired),
    activeCandidates: counts?.active ?? 0,
  };
}
