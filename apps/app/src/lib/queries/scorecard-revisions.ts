import "server-only";

import { and, asc, eq, exists, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  applicationStages,
  positionStages,
  scorecardCriteria,
  scorecardRevisionRatings,
  scorecardRevisions,
  scorecards,
  user,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { canViewApplication } from "./activity";

export type ScorecardRevisionRatingView = {
  criterionId: string;
  label: string;
  weight: number;
  rating: number;
  comment: string | null;
};

export type ScorecardRevisionView = {
  id: string;
  revisionNumber: number;
  authorName: string;
  createdAt: Date;
  recommendation: "strong_no" | "no" | "yes" | "strong_yes" | null;
  overallScore: string | null;
  strengths: string | null;
  concerns: string | null;
  notes: string | null;
  ratings: ScorecardRevisionRatingView[];
};

export type ScorecardRevisionGroup = {
  scorecardId: string;
  scorecardAuthorName: string;
  stageName: string;
  revisions: ScorecardRevisionView[];
};

/**
 * Immutable scorecard snapshots visible to this viewer for one application.
 *
 * The page guard is deliberately repeated here so a future server caller
 * cannot use this query as an alternate path to application or feedback data.
 * Interviewers only receive a scorecard's revisions after submitting their
 * own scorecard for that exact application-stage; submitting elsewhere does
 * not unlock it. HR and management retain their established read-all access.
 */
export async function getApplicationScorecardRevisions(
  applicationId: string,
  viewer: SessionUser,
): Promise<ScorecardRevisionGroup[]> {
  if (!(await canViewApplication(viewer, applicationId))) return [];

  const seesEverything = can(viewer.role, "scorecard:read-all");
  const viewerScorecards = alias(scorecards, "viewer_scorecards");
  const scorecardAuthor = alias(user, "scorecard_author");
  const revisionAuthor = alias(user, "revision_author");

  const revisionRows = await db
    .select({
      scorecardId: scorecards.id,
      scorecardAuthorName: scorecardAuthor.name,
      stageName: positionStages.name,
      revisionId: scorecardRevisions.id,
      revisionNumber: scorecardRevisions.revisionNumber,
      revisionAuthorName: revisionAuthor.name,
      createdAt: scorecardRevisions.createdAt,
      recommendation: scorecardRevisions.recommendation,
      overallScore: scorecardRevisions.overallScore,
      strengths: scorecardRevisions.strengths,
      concerns: scorecardRevisions.concerns,
      notes: scorecardRevisions.notes,
    })
    .from(scorecardRevisions)
    .innerJoin(scorecards, eq(scorecards.id, scorecardRevisions.scorecardId))
    .innerJoin(
      applicationStages,
      eq(applicationStages.id, scorecards.applicationStageId),
    )
    .innerJoin(
      positionStages,
      eq(positionStages.id, applicationStages.positionStageId),
    )
    .innerJoin(scorecardAuthor, eq(scorecardAuthor.id, scorecards.authorId))
    .innerJoin(revisionAuthor, eq(revisionAuthor.id, scorecardRevisions.authorId))
    .where(
      and(
        eq(scorecards.applicationId, applicationId),
        eq(scorecards.status, "submitted"),
        seesEverything
          ? undefined
          : exists(
              db
                .select({ id: viewerScorecards.id })
                .from(viewerScorecards)
                .where(
                  and(
                    eq(viewerScorecards.applicationId, applicationId),
                    eq(
                      viewerScorecards.applicationStageId,
                      scorecards.applicationStageId,
                    ),
                    eq(viewerScorecards.authorId, viewer.id),
                    eq(viewerScorecards.status, "submitted"),
                  ),
                ),
            ),
      ),
    )
    .orderBy(
      asc(positionStages.orderIndex),
      asc(scorecardAuthor.name),
      asc(scorecardRevisions.revisionNumber),
    );

  if (revisionRows.length === 0) return [];

  const ratingRows = await db
    .select({
      revisionId: scorecardRevisionRatings.revisionId,
      criterionId: scorecardRevisionRatings.criterionId,
      label: scorecardCriteria.label,
      weight: scorecardCriteria.weight,
      rating: scorecardRevisionRatings.rating,
      comment: scorecardRevisionRatings.comment,
    })
    .from(scorecardRevisionRatings)
    .innerJoin(
      scorecardCriteria,
      eq(scorecardCriteria.id, scorecardRevisionRatings.criterionId),
    )
    .where(
      inArray(
        scorecardRevisionRatings.revisionId,
        revisionRows.map((row) => row.revisionId),
      ),
    )
    .orderBy(asc(scorecardCriteria.orderIndex));

  const ratingsByRevision = new Map<string, ScorecardRevisionRatingView[]>();
  for (const rating of ratingRows) {
    const ratings = ratingsByRevision.get(rating.revisionId) ?? [];
    ratings.push({
      criterionId: rating.criterionId,
      label: rating.label,
      weight: rating.weight,
      rating: rating.rating,
      comment: rating.comment,
    });
    ratingsByRevision.set(rating.revisionId, ratings);
  }

  const groups = new Map<string, ScorecardRevisionGroup>();
  for (const row of revisionRows) {
    const group = groups.get(row.scorecardId) ?? {
      scorecardId: row.scorecardId,
      scorecardAuthorName: row.scorecardAuthorName,
      stageName: row.stageName,
      revisions: [],
    };

    group.revisions.push({
      id: row.revisionId,
      revisionNumber: row.revisionNumber,
      authorName: row.revisionAuthorName,
      createdAt: row.createdAt,
      recommendation: row.recommendation,
      overallScore: row.overallScore,
      strengths: row.strengths,
      concerns: row.concerns,
      notes: row.notes,
      ratings: ratingsByRevision.get(row.revisionId) ?? [],
    });
    groups.set(row.scorecardId, group);
  }

  return Array.from(groups.values());
}
