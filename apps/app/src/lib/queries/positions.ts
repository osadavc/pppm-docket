import "server-only";

import { and, asc, count, desc, eq, gt, ilike, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { applications, positions, positionStages, user } from "@/db/schema";
import type { PositionStatus } from "@/db/schema/enums";

/**
 * The status a candidate is allowed to see. Kept in lib/domain/position-status
 * so the careers queries and the "accepts applications" rule cannot drift, a
 * role must never be advertised somewhere it cannot be applied to.
 */
const PUBLIC_STATUS = "open" as const satisfies PositionStatus;

/** Open, and either undated or not yet past its deadline. */
function publiclyOpen(now: Date) {
  return and(
    eq(positions.status, PUBLIC_STATUS),
    or(
      isNull(positions.applicationDeadline),
      gt(positions.applicationDeadline, now),
    ),
  );
}

export type PublicPositionRow = {
  id: string;
  title: string;
  department: string;
  location: string | null;
  employmentType: (typeof positions.$inferSelect)["employmentType"];
  openings: number;
  applicationDeadline: Date | null;
  openedAt: Date | null;
};

/**
 * The ONLY query a public careers board may use.
 *
 * Filters to status = 'open' *and* an unexpired deadline, so a role whose
 * window has closed drops off the board even though its detail page (and the
 * receipt for anyone who applied in time) stays reachable. Drafts and
 * positions awaiting approval can never reach this page.
 */
export async function listPublicPositions(now: Date = new Date()) {
  return db
    .select({
      id: positions.id,
      title: positions.title,
      department: positions.department,
      location: positions.location,
      employmentType: positions.employmentType,
      openings: positions.openings,
      applicationDeadline: positions.applicationDeadline,
      openedAt: positions.openedAt,
    })
    .from(positions)
    .where(publiclyOpen(now))
    .orderBy(asc(positions.department), desc(positions.openedAt));
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
  onHoldCount: number;
};

export const POSITIONS_PAGE_SIZE = 20;

export type PositionListFilter = {
  q: string;
  status: PositionStatus | undefined;
  page: number;
};

export type PositionListPage = {
  rows: PositionListItem[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

/**
 * Internal listing, staff only, includes drafts. Filtered, searched and
 * paged in SQL; the total is a window count over the filtered set so a page
 * and its count arrive together.
 */
export async function listPositions(
  filter: PositionListFilter = { q: "", status: undefined, page: 1 },
): Promise<PositionListPage> {
  const where: SQL[] = [];
  if (filter.q) {
    const term = `%${filter.q}%`;
    where.push(or(ilike(positions.title, term), ilike(positions.department, term))!);
  }
  if (filter.status) where.push(eq(positions.status, filter.status));
  const predicate = where.length > 0 ? and(...where) : undefined;
  const page = Math.max(1, filter.page);

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
      // The outer reference is written literally rather than interpolated.
      // Drizzle renders an interpolated column inside a sql template as a bare
      // "id", which resolves against the SUBQUERY's table rather than this one
      //, so the predicate silently compares a table to itself and counts zero.
      // Live stages only: an archived stage is off the process.
      stageCount: sql<number>`(
        select count(*)::int from position_stages ps
        where ps.position_id = "positions"."id" and ps.is_archived = false
      )`,
      // Active only: a held candidate is out of the running until resumed, so
      // counting them here would overstate how full the pipeline is.
      candidateCount: sql<number>`(
        select count(*)::int from applications a
        where a.position_id = "positions"."id" and a.status = 'active'
      )`,
      onHoldCount: sql<number>`(
        select count(*)::int from applications a
        where a.position_id = "positions"."id" and a.status = 'on_hold'
      )`,
      total: sql<number>`count(*) over()`,
    })
    .from(positions)
    .where(predicate)
    .orderBy(desc(positions.createdAt))
    .limit(POSITIONS_PAGE_SIZE)
    .offset((page - 1) * POSITIONS_PAGE_SIZE);

  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && page > 1) {
    const [counted] = await db.select({ n: count() }).from(positions).where(predicate);
    total = counted?.n ?? 0;
  }

  return {
    rows: rows.map((row) => {
      const { total: _ignored, ...item } = row;
      void _ignored;
      return item;
    }),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / POSITIONS_PAGE_SIZE)),
    pageSize: POSITIONS_PAGE_SIZE,
  };
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

/** True once anyone has applied, used to protect stages from destructive edits. */
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
          and ${positionStages.isArchived} = false
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
      openings: positions.openings,
      applicationDeadline: positions.applicationDeadline,
    })
    .from(positions)
    .where(and(eq(positions.id, positionId), eq(positions.status, PUBLIC_STATUS)))
    .limit(1);
  return row ?? null;
}

/**
 * Title only, any status. For the post-apply receipt, where the role closing
 * a moment after someone applied must not 404 their confirmation.
 */
export async function getPositionTitle(positionId: string) {
  const [row] = await db
    .select({ id: positions.id, title: positions.title })
    .from(positions)
    .where(eq(positions.id, positionId))
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
