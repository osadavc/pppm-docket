import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  applications,
  attachments,
  candidates,
  positions,
  positionStages,
} from "@/db/schema";

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
