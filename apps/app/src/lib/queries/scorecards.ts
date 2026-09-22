import "server-only";

import { and, asc, count, desc, eq, exists, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  applicationStages,
  positionStages,
  scorecardCriteria,
  scorecardRatings,
  scorecards,
  user,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { canViewApplication } from "./activity";

export type ScorecardRatingView = {
  criterionId: string;
  label: string;
  weight: number;
  rating: number;
  comment: string | null;
};

export type ApplicationScorecardView = {
  id: string;
  applicationStageId: string;
  authorId: string;
  authorName: string;
  stageName: string;
  submittedAt: Date | null;
  recommendation: "strong_no" | "no" | "yes" | "strong_yes" | null;
  overallScore: string | null;
  strengths: string | null;
  concerns: string | null;
  notes: string | null;
  ratings: ScorecardRatingView[];
};

export type ApplicationScorecards = {
  scorecards: ApplicationScorecardView[];
  hiddenCount: number;
  /** All submitted feedback: the visible list plus independent reads. */
  total: number;
};

/**
 * Submitted application feedback available to a particular viewer.
 *
 * Interviewers always receive their own scorecards. Peer scorecards are only
 * selected after the viewer has submitted feedback for that exact
 * application-stage. The visibility predicate lives in SQL so hidden peer
 * values never cross this data-access boundary. HR and management keep their
 * established read-all permission.
 */
export async function listScorecardsForApplication(
  applicationId: string,
  viewer: SessionUser,
): Promise<ApplicationScorecards> {
  // Repeat the page's application guard at the data boundary. This prevents a
  // future server caller from using this function to disclose scorecards.
  if (!(await canViewApplication(viewer, applicationId))) {
    return { scorecards: [], hiddenCount: 0, total: 0 };
  }

  const seesEverything = can(viewer.role, "scorecard:read-all");
  const viewerScorecards = alias(scorecards, "viewer_scorecards");
  const viewerSubmittedForSameStage = exists(
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
  );

  const [scorecardRows, submittedCountRows] = await Promise.all([
    db
      .select({
        id: scorecards.id,
        applicationStageId: scorecards.applicationStageId,
        authorId: scorecards.authorId,
        authorName: user.name,
        stageName: positionStages.name,
        submittedAt: scorecards.submittedAt,
        recommendation: scorecards.recommendation,
        overallScore: scorecards.overallScore,
        strengths: scorecards.strengths,
        concerns: scorecards.concerns,
        notes: scorecards.notes,
      })
      .from(scorecards)
      .innerJoin(user, eq(user.id, scorecards.authorId))
      .innerJoin(
        applicationStages,
        eq(applicationStages.id, scorecards.applicationStageId),
      )
      .innerJoin(
        positionStages,
        eq(positionStages.id, applicationStages.positionStageId),
      )
      .where(
        and(
          eq(scorecards.applicationId, applicationId),
          eq(scorecards.status, "submitted"),
          seesEverything ? undefined : viewerSubmittedForSameStage,
        ),
      )
      .orderBy(desc(scorecards.submittedAt), desc(scorecards.createdAt)),
    db
      .select({ submittedCount: count() })
      .from(scorecards)
      .where(
        and(
          eq(scorecards.applicationId, applicationId),
          eq(scorecards.status, "submitted"),
        ),
      ),
  ]);

  // The total is harmless metadata once application-level access has passed;
  // subtracting the SQL-filtered list avoids selecting any hidden scorecard
  // values merely to calculate the independent-reads notice.
  const submittedCount = Number(submittedCountRows[0]?.submittedCount ?? 0);
  const hiddenCount = seesEverything
    ? 0
    : Math.max(0, submittedCount - scorecardRows.length);
  if (scorecardRows.length === 0) {
    return { scorecards: [], hiddenCount, total: hiddenCount };
  }

  const ratingRows = await db
    .select({
      scorecardId: scorecardRatings.scorecardId,
      criterionId: scorecardRatings.criterionId,
      label: scorecardCriteria.label,
      weight: scorecardCriteria.weight,
      rating: scorecardRatings.rating,
      comment: scorecardRatings.comment,
    })
    .from(scorecardRatings)
    .innerJoin(
      scorecardCriteria,
      eq(scorecardCriteria.id, scorecardRatings.criterionId),
    )
    .where(
      inArray(
        scorecardRatings.scorecardId,
        scorecardRows.map((scorecard) => scorecard.id),
      ),
    )
    .orderBy(asc(scorecardCriteria.orderIndex));

  const ratingsByScorecard = new Map<string, ScorecardRatingView[]>();
  for (const rating of ratingRows) {
    const ratings = ratingsByScorecard.get(rating.scorecardId) ?? [];
    ratings.push({
      criterionId: rating.criterionId,
      label: rating.label,
      weight: rating.weight,
      rating: rating.rating,
      comment: rating.comment,
    });
    ratingsByScorecard.set(rating.scorecardId, ratings);
  }

  return {
    scorecards: scorecardRows.map((scorecard) => ({
      ...scorecard,
      ratings: ratingsByScorecard.get(scorecard.id) ?? [],
    })),
    hiddenCount,
    total: scorecardRows.length + hiddenCount,
  };
}
