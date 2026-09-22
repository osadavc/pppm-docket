"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  applications,
  applicationStages,
  positionStageInterviewers,
  scorecardRatings,
  scorecardRevisionRatings,
  scorecardRevisions,
  scorecards,
  user,
} from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { requireUser } from "@/lib/auth/guards";
import { calculateWeightedScore } from "@/lib/domain/scorecard";
import {
  getFeedbackContext,
  getScorecardEditContext,
} from "@/lib/queries/feedback";
import {
  recommendationValues,
  scorecardSubmissionSchema,
} from "@/lib/validation/scorecard";
import { fail, ok, type ActionResult } from "./result";

export type SaveScorecardResult = ActionResult<{
  status: "submitted";
  revised: boolean;
  changed: boolean;
  revisionNumber: number;
}>;

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

type SnapshotRating = {
  criterionId: string;
  rating: number;
  comment: string | null;
};

function ratingsMatch(current: SnapshotRating[], proposed: SnapshotRating[]) {
  const byCriterion = (ratings: SnapshotRating[]) =>
    [...ratings].sort((a, b) => a.criterionId.localeCompare(b.criterionId));
  const left = byCriterion(current);
  const right = byCriterion(proposed);

  return (
    left.length === right.length &&
    left.every(
      (rating, index) =>
        rating.criterionId === right[index]?.criterionId &&
        rating.rating === right[index]?.rating &&
        (rating.comment ?? "") === (right[index]?.comment ?? ""),
    )
  );
}

function validationFieldErrors(
  issues: Array<{ path: PropertyKey[]; message: string }>,
  criteria: Array<{ id: string }>,
) {
  const errors: Record<string, string[]> = {};

  for (const issue of issues) {
    let key = typeof issue.path[0] === "string" ? issue.path[0] : "form";
    if (key === "ratings" && typeof issue.path[1] === "number") {
      const criterion = criteria[issue.path[1]];
      const field = issue.path[2] === "comment" ? "comment" : "rating";
      if (criterion) key = `${field}.${criterion.id}`;
    }
    errors[key] = [...(errors[key] ?? []), issue.message];
  }

  return errors;
}

class ScorecardAlreadySubmittedError extends Error {}
class ScorecardNotEligibleError extends Error {}
class ScorecardRevisionUnavailableError extends Error {}
class ScorecardRevisionConflictError extends Error {}

/**
 * Save, submit or revise the viewer's own scorecard.
 *
 * The assignment is re-read here on every POST. Rendering the form is not
 * authority: if the candidate moves stage while the page is open, this action
 * refuses the stale submission.
 */
export async function saveScorecard(
  _previousState: SaveScorecardResult | null,
  formData: FormData,
): Promise<SaveScorecardResult> {
  const actor = await requireUser();
  const applicationIdResult = z.uuid().safeParse(formData.get("applicationId"));
  if (!applicationIdResult.success)
    return fail("That application is not valid.");

  const applicationId = applicationIdResult.data;
  const isRevisionIntent = formData.get("intent") === "revise";
  const scorecardIdResult = z.uuid().safeParse(formData.get("scorecardId"));
  const context = isRevisionIntent
    ? scorecardIdResult.success
      ? await getScorecardEditContext(
          actor,
          applicationId,
          scorecardIdResult.data,
        )
      : null
    : await getFeedbackContext(actor.id, applicationId);
  if (!context) {
    return fail(
      isRevisionIntent
        ? "This submitted feedback is not available for editing."
        : "This application is no longer active at a stage assigned to you.",
    );
  }
  const recommendationRaw = formData.get("recommendation");
  const recommendation =
    typeof recommendationRaw === "string" &&
    recommendationValues.includes(
      recommendationRaw as (typeof recommendationValues)[number],
    )
      ? (recommendationRaw as (typeof recommendationValues)[number])
      : null;

  const parsed = scorecardSubmissionSchema.safeParse({
    applicationId,
    intent: formData.get("intent"),
    baseRevision: formData.get("baseRevision"),
    recommendation,
    strengths: text(formData, "strengths"),
    concerns: text(formData, "concerns"),
    notes: text(formData, "notes"),
    ratings: context.criteria.map((criterion) => {
      const rawRating = formData.get(`rating.${criterion.id}`);
      return {
        criterionId: criterion.id,
        rating:
          typeof rawRating === "string" && rawRating !== ""
            ? Number(rawRating)
            : null,
        comment: text(formData, `comment.${criterion.id}`),
      };
    }),
  });

  if (!parsed.success) {
    return fail(
      "Check the highlighted feedback fields and try again.",
      validationFieldErrors(parsed.error.issues, context.criteria),
    );
  }

  const input = parsed.data;
  const isRevision = input.intent === "revise";

  if (context.scorecard?.status === "submitted" && !isRevision) {
    return fail("You already submitted feedback.");
  }
  if (context.scorecard?.status !== "submitted" && isRevision) {
    return fail("Only submitted feedback can be revised.");
  }

  const unrated = context.criteria.filter(
    (criterion) =>
      !input.ratings.find(
        (rating) =>
          rating.criterionId === criterion.id && rating.rating !== null,
      ),
  );
  if (unrated.length > 0) {
    return fail(
      `Rate every criterion before submitting. Still needed: ${unrated.map((criterion) => criterion.label).join(", ")}.`,
      Object.fromEntries(
        unrated.map((criterion) => [
          `rating.${criterion.id}`,
          ["Choose a rating from 1 to 5"],
        ]),
      ),
    );
  }

  const rated = input.ratings.filter(
    (rating): rating is typeof rating & { rating: number } =>
      rating.rating !== null,
  );
  const proposedRatings: SnapshotRating[] = rated.map((rating) => ({
    criterionId: rating.criterionId,
    rating: rating.rating,
    comment: rating.comment || null,
  }));
  const weightedScore = calculateWeightedScore(context.criteria, rated);
  const now = new Date();

  let outcome: {
    changed: boolean;
    revisionNumber: number;
  };

  try {
    // Scorecard identity/status and the full replacement set of ratings share
    // one PostgreSQL transaction. Any failed rating insert rolls back the
    // scorecard insert/update and the preceding rating deletion with it.
    outcome = await db.transaction(async (tx) => {
      // A new submission must still be for the active, current assigned
      // stage. An edit deliberately follows the authored scorecard instead:
      // its author may correct it while the application is active or on hold,
      // even after the candidate has moved on.
      const [eligible] = isRevision
        ? await tx
            .select({ applicationStageId: applicationStages.id })
            .from(applications)
            .innerJoin(
              applicationStages,
              and(
                eq(applicationStages.applicationId, applications.id),
                eq(applicationStages.id, context.applicationStageId),
              ),
            )
            .innerJoin(
              scorecards,
              and(
                eq(scorecards.id, context.scorecard!.id),
                eq(scorecards.applicationId, applications.id),
                eq(scorecards.applicationStageId, applicationStages.id),
                eq(scorecards.authorId, actor.id),
                eq(scorecards.status, "submitted"),
              ),
            )
            .innerJoin(
              user,
              and(eq(user.id, scorecards.authorId), eq(user.isActive, true)),
            )
            .where(
              and(
                eq(applications.id, applicationId),
                inArray(applications.status, ["active", "on_hold"]),
                eq(user.id, actor.id),
                eq(user.isActive, true),
              ),
            )
            .limit(1)
            .for("update", {
              of: [applications, applicationStages, scorecards, user],
            })
        : await tx
            .select({ applicationStageId: applicationStages.id })
            .from(applications)
            .innerJoin(
              applicationStages,
              and(
                eq(applicationStages.applicationId, applications.id),
                eq(
                  applicationStages.positionStageId,
                  applications.currentStageId,
                ),
              ),
            )
            .innerJoin(
              positionStageInterviewers,
              and(
                eq(
                  positionStageInterviewers.positionStageId,
                  applications.currentStageId,
                ),
                eq(positionStageInterviewers.userId, actor.id),
              ),
            )
            .innerJoin(
              user,
              and(
                eq(user.id, positionStageInterviewers.userId),
                eq(user.id, actor.id),
                eq(user.isActive, true),
              ),
            )
            .where(
              and(
                eq(applications.id, applicationId),
                eq(applications.status, "active"),
                eq(applications.currentStageId, context.stageId),
                eq(applicationStages.id, context.applicationStageId),
                eq(applicationStages.status, "in_progress"),
              ),
            )
            .limit(1)
            .for("update", {
              of: [
                applications,
                applicationStages,
                positionStageInterviewers,
                user,
              ],
            });

      if (!eligible) throw new ScorecardNotEligibleError();

      const scorecardValues = {
        status: "submitted" as const,
        recommendation: input.recommendation,
        overallScore: weightedScore === null ? null : weightedScore.toFixed(2),
        strengths: input.strengths || null,
        concerns: input.concerns || null,
        notes: input.notes || null,
        ...(input.intent === "submit" ? { submittedAt: now } : {}),
      };

      let scorecardId = context.scorecard?.id;
      let revisionNumber = 0;
      let revision:
        | {
            previous: Record<string, unknown>;
            current: Record<string, unknown>;
          }
        | undefined;

      if (scorecardId) {
        if (isRevision) {
          const [existing] = await tx
            .select({
              id: scorecards.id,
              recommendation: scorecards.recommendation,
              overallScore: scorecards.overallScore,
              strengths: scorecards.strengths,
              concerns: scorecards.concerns,
              notes: scorecards.notes,
              submittedAt: scorecards.submittedAt,
              revisionCount: scorecards.revisionCount,
            })
            .from(scorecards)
            .where(
              and(
                eq(scorecards.id, scorecardId),
                eq(scorecards.applicationId, applicationId),
                eq(scorecards.applicationStageId, eligible.applicationStageId),
                eq(scorecards.authorId, actor.id),
                eq(scorecards.status, "submitted"),
              ),
            )
            .limit(1)
            .for("update");

          if (!existing) throw new ScorecardRevisionUnavailableError();

          const previousRatings = await tx
            .select({
              criterionId: scorecardRatings.criterionId,
              rating: scorecardRatings.rating,
              comment: scorecardRatings.comment,
            })
            .from(scorecardRatings)
            .where(eq(scorecardRatings.scorecardId, scorecardId));

          const [latestRevision] = await tx
            .select({ revisionNumber: scorecardRevisions.revisionNumber })
            .from(scorecardRevisions)
            .where(eq(scorecardRevisions.scorecardId, scorecardId))
            .orderBy(desc(scorecardRevisions.revisionNumber))
            .limit(1);

          if (!latestRevision) throw new ScorecardRevisionUnavailableError();
          if (
            latestRevision.revisionNumber !== input.baseRevision ||
            existing.revisionCount !== input.baseRevision
          ) {
            throw new ScorecardRevisionConflictError();
          }

          const proposedOverallScore =
            weightedScore === null ? null : weightedScore.toFixed(2);
          const unchanged =
            existing.recommendation === input.recommendation &&
            existing.overallScore === proposedOverallScore &&
            (existing.strengths ?? "") === input.strengths &&
            (existing.concerns ?? "") === input.concerns &&
            (existing.notes ?? "") === input.notes &&
            ratingsMatch(previousRatings, proposedRatings);

          if (unchanged) {
            return {
              changed: false,
              revisionNumber: latestRevision.revisionNumber,
            };
          }

          revisionNumber = latestRevision.revisionNumber + 1;

          const [updated] = await tx
            .update(scorecards)
            .set({ ...scorecardValues, revisionCount: revisionNumber })
            .where(
              and(
                eq(scorecards.id, scorecardId),
                eq(scorecards.applicationId, applicationId),
                eq(scorecards.applicationStageId, eligible.applicationStageId),
                eq(scorecards.authorId, actor.id),
                eq(scorecards.status, "submitted"),
                eq(scorecards.revisionCount, input.baseRevision),
              ),
            )
            .returning({ id: scorecards.id });
          if (!updated) throw new ScorecardRevisionConflictError();

          revision = {
            previous: {
              recommendation: existing.recommendation,
              overallScore: existing.overallScore,
              strengths: existing.strengths,
              concerns: existing.concerns,
              notes: existing.notes,
              submittedAt: existing.submittedAt?.toISOString() ?? null,
              ratings: previousRatings,
            },
            current: {
              recommendation: input.recommendation,
              overallScore: proposedOverallScore,
              strengths: input.strengths || null,
              concerns: input.concerns || null,
              notes: input.notes || null,
              submittedAt: existing.submittedAt?.toISOString() ?? null,
              ratings: proposedRatings,
            },
          };
        } else {
          const [updated] = await tx
            .update(scorecards)
            .set({ ...scorecardValues, revisionCount: 1 })
            .where(
              and(
                eq(scorecards.id, scorecardId),
                eq(scorecards.applicationId, applicationId),
                eq(scorecards.applicationStageId, eligible.applicationStageId),
                eq(scorecards.authorId, actor.id),
                eq(scorecards.status, "draft"),
              ),
            )
            .returning({ id: scorecards.id });
          if (!updated) throw new ScorecardAlreadySubmittedError();
          revisionNumber = 1;
        }
      } else {
        if (isRevision) throw new ScorecardRevisionUnavailableError();

        const [inserted] = await tx
          .insert(scorecards)
          .values({
            applicationId,
            applicationStageId: eligible.applicationStageId,
            authorId: actor.id,
            revisionCount: 1,
            ...scorecardValues,
          })
          .onConflictDoNothing({
            target: [scorecards.applicationStageId, scorecards.authorId],
          })
          .returning({ id: scorecards.id });

        if (inserted) {
          scorecardId = inserted.id;
        } else {
          // A concurrent request created the unique row after the page load.
          // Only a legacy draft may be converted; a submitted row is refused.
          const [updated] = await tx
            .update(scorecards)
            .set({ ...scorecardValues, revisionCount: 1 })
            .where(
              and(
                eq(scorecards.applicationId, applicationId),
                eq(scorecards.applicationStageId, eligible.applicationStageId),
                eq(scorecards.authorId, actor.id),
                eq(scorecards.status, "draft"),
              ),
            )
            .returning({ id: scorecards.id });
          if (!updated) throw new ScorecardAlreadySubmittedError();
          scorecardId = updated.id;
        }

        revisionNumber = 1;
      }

      await tx
        .delete(scorecardRatings)
        .where(eq(scorecardRatings.scorecardId, scorecardId));

      if (rated.length > 0) {
        await tx.insert(scorecardRatings).values(
          proposedRatings.map((rating) => ({
            scorecardId,
            criterionId: rating.criterionId,
            rating: rating.rating,
            comment: rating.comment,
          })),
        );
      }

      if (revisionNumber > 0) {
        const [savedRevision] = await tx
          .insert(scorecardRevisions)
          .values({
            scorecardId,
            revisionNumber,
            authorId: actor.id,
            recommendation: input.recommendation,
            overallScore:
              weightedScore === null ? null : weightedScore.toFixed(2),
            strengths: input.strengths || null,
            concerns: input.concerns || null,
            notes: input.notes || null,
            createdAt: now,
          })
          .returning({ id: scorecardRevisions.id });

        if (proposedRatings.length > 0) {
          await tx.insert(scorecardRevisionRatings).values(
            proposedRatings.map((rating) => ({
              revisionId: savedRevision.id,
              criterionId: rating.criterionId,
              rating: rating.rating,
              comment: rating.comment,
              createdAt: now,
            })),
          );
        }
      }

      if (revision) {
        await logActivity(tx, {
          actorId: actor.id,
          action: "scorecard.updated",
          entityType: "scorecard",
          entityId: scorecardId,
          applicationId,
          positionId: context.positionId,
          summary: `${actor.name} revised feedback for “${context.stageName}”`,
          metadata: {
            applicationStageId: eligible.applicationStageId,
            stageId: context.stageId,
            stageName: context.stageName,
            revisedAt: now.toISOString(),
            revisionNumber,
            ...revision,
          },
        });
      }

      if (input.intent === "submit") {
        await logActivity(tx, {
          actorId: actor.id,
          action: "scorecard.submitted",
          entityType: "scorecard",
          entityId: scorecardId,
          applicationId,
          positionId: context.positionId,
          summary: `${actor.name} submitted feedback for “${context.stageName}”`,
          metadata: {
            applicationStageId: eligible.applicationStageId,
            stageId: context.stageId,
            stageName: context.stageName,
            submittedAt: now.toISOString(),
          },
        });
      }

      return { changed: true, revisionNumber };
    });
  } catch (error) {
    if (error instanceof ScorecardNotEligibleError) {
      return fail(
        "This application is no longer active at a stage assigned to you.",
      );
    }
    if (error instanceof ScorecardAlreadySubmittedError) {
      return fail("You already submitted feedback.");
    }
    if (error instanceof ScorecardRevisionUnavailableError) {
      return fail(
        "Submitted feedback has no revision history and cannot be edited safely.",
      );
    }
    if (error instanceof ScorecardRevisionConflictError) {
      return fail(
        "This feedback was changed by another session — reload and try again.",
      );
    }
    throw error;
  }

  return ok({
    status: "submitted",
    revised: isRevision && outcome.changed,
    changed: outcome.changed,
    revisionNumber: outcome.revisionNumber,
  });
}
