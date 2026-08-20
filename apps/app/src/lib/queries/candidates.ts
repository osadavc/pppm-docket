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
