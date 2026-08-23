import "server-only";

import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import {
  applications,
  attachments,
  candidates,
  positions,
  positionStages,
} from "@/db/schema";
import {
  PAGE_SIZE,
  type CandidateSearch,
} from "@/lib/validation/candidate-search";

export async function listCandidates() {
  return db
    .select({
      id: candidates.id,
      fullName: candidates.fullName,
      email: candidates.email,
      currentTitle: candidates.currentTitle,
      source: candidates.source,
      createdAt: candidates.createdAt,
      positionTitle: positions.title,
      stageName: positionStages.name,
      applicationStatus: applications.status,
      attachmentId: attachments.id,
      // Computed over the full filtered set before LIMIT, so the page and its
      // total arrive in ONE round trip. At this distance from the database a
      // second query costs more than the query itself: execution is ~3ms,
      // a round trip is ~136ms.
      total: sql<number>`count(*) over()`,
    })
    .from(candidates)
    .leftJoin(applications, eq(applications.candidateId, candidates.id))
    .leftJoin(positions, eq(positions.id, applications.positionId))
    .leftJoin(positionStages, eq(positionStages.id, applications.currentStageId))
    .leftJoin(
      attachments,
      and(eq(attachments.candidateId, candidates.id), eq(attachments.kind, "cv")),
    )
    .orderBy(desc(candidates.createdAt));
}

export async function getCandidate(candidateId: string) {
  return db.query.candidates.findFirst({
    where: eq(candidates.id, candidateId),
    with: {
      applications: {
        with: {
          position: { columns: { id: true, title: true, status: true } },
          currentStage: { columns: { id: true, name: true } },
        },
      },
      attachments: true,
      createdBy: { columns: { id: true, name: true } },
      referredBy: { columns: { id: true, name: true } },
    },
  });
}

/** Positions a candidate can actually be added to right now. */
export async function listOpenPositionsForApplication() {
  return db
    .select({ id: positions.id, title: positions.title, department: positions.department })
    .from(positions)
    .where(eq(positions.status, "open"))
    .orderBy(asc(positions.title));
}

export type PriorApplication = {
  positionId: string;
  positionTitle: string;
  positionStatus: string;
  stageName: string | null;
  status: string;
  appliedAt: Date;
};

export type ExistingCandidate = {
  id: string;
  fullName: string;
  email: string;
  currentTitle: string | null;
  applications: PriorApplication[];
};

/**
 * Look a person up by email so HR can see they are already on file *before*
 * adding them again — the point of de-duplicating is knowing the history, not
 * just silently reusing a row.
 *
 * Matched case-insensitively: emails are stored lowercased, but a human typing
 * "Nimal@Example.com" must still find the existing record.
 */
export async function findCandidateByEmail(
  email: string,
): Promise<ExistingCandidate | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const candidate = await db.query.candidates.findFirst({
    where: eq(candidates.email, normalized),
    columns: { id: true, fullName: true, email: true, currentTitle: true },
  });
  if (!candidate) return null;

  const rows = await db
    .select({
      positionId: positions.id,
      positionTitle: positions.title,
      positionStatus: positions.status,
      stageName: positionStages.name,
      status: applications.status,
      appliedAt: applications.appliedAt,
    })
    .from(applications)
    .innerJoin(positions, eq(positions.id, applications.positionId))
    .leftJoin(positionStages, eq(positionStages.id, applications.currentStageId))
    .where(eq(applications.candidateId, candidate.id))
    .orderBy(desc(applications.appliedAt));

  return { ...candidate, applications: rows };
}

export type CandidateSearchRow = {
  applicationId: string | null;
  candidateId: string;
  fullName: string;
  email: string;
  currentTitle: string | null;
  source: string;
  appliedAt: Date | null;
  positionId: string | null;
  positionTitle: string | null;
  stageId: string | null;
  stageName: string | null;
  status: string | null;
  attachmentId: string | null;
};

/**
 * Server-side search and paging over the applicant pool.
 *
 * One row per application rather than per candidate, because the filters HR
 * cares about — stage and status — belong to an application, not a person.
 * Everything is applied in SQL: nothing is fetched and then discarded, so the
 * cost of a page is the page, not the pool.
 */
export async function searchCandidates(search: CandidateSearch) {
  const where: SQL[] = [];

  if (search.q) {
    const term = `%${search.q}%`;
    where.push(
      or(ilike(candidates.fullName, term), ilike(candidates.email, term))!,
    );
  }
  if (search.positionId) where.push(eq(applications.positionId, search.positionId));
  if (search.stageId) where.push(eq(applications.currentStageId, search.stageId));
  if (search.status)
    where.push(
      eq(
        applications.status,
        search.status as (typeof applications.status.enumValues)[number],
      ),
    );

  const predicate = where.length > 0 ? and(...where) : undefined;
  const offset = (search.page - 1) * PAGE_SIZE;

  const rows = await db
    .select({
      applicationId: applications.id,
      candidateId: candidates.id,
      fullName: candidates.fullName,
      email: candidates.email,
      currentTitle: candidates.currentTitle,
      source: candidates.source,
      appliedAt: applications.appliedAt,
      positionId: positions.id,
      positionTitle: positions.title,
      stageId: positionStages.id,
      stageName: positionStages.name,
      status: applications.status,
      attachmentId: attachments.id,
      // Counted over the full filtered set before LIMIT, so a page and its
      // total arrive in ONE round trip. At this distance from the database a
      // second query costs far more than the query itself: execution is ~3ms,
      // a round trip is ~136ms.
      total: sql<number>`count(*) over()`,
    })
    .from(candidates)
    .leftJoin(applications, eq(applications.candidateId, candidates.id))
    .leftJoin(positions, eq(positions.id, applications.positionId))
    .leftJoin(positionStages, eq(positionStages.id, applications.currentStageId))
    .leftJoin(
      attachments,
      and(
        eq(attachments.applicationId, applications.id),
        eq(attachments.kind, "cv"),
      ),
    )
    .where(predicate)
    .orderBy(desc(applications.appliedAt), asc(candidates.fullName))
    .limit(PAGE_SIZE)
    .offset(offset);

  // A window function cannot report a total for a page that has no rows, so
  // only then do we pay for a second query — a rare path (paging past the end).
  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && search.page > 1) {
    const [counted] = await db
      .select({ n: count() })
      .from(candidates)
      .leftJoin(applications, eq(applications.candidateId, candidates.id))
      .where(predicate);
    total = counted?.n ?? 0;
  }
  return {
    rows: rows as CandidateSearchRow[],
    total,
    page: search.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    pageSize: PAGE_SIZE,
  };
}

/** Stage options for the filter bar — only meaningful once a position is chosen. */
export async function listStagesForFilter(positionId: string) {
  if (!positionId) return [];
  return db
    .select({ id: positionStages.id, name: positionStages.name })
    .from(positionStages)
    .where(
      and(
        eq(positionStages.positionId, positionId),
        eq(positionStages.isArchived, false),
      ),
    )
    .orderBy(asc(positionStages.orderIndex));
}

/** Every position, so HR can filter closed ones too — not just open roles. */
export async function listAllPositionsForFilter() {
  return db
    .select({ id: positions.id, title: positions.title })
    .from(positions)
    .orderBy(asc(positions.title));
}
