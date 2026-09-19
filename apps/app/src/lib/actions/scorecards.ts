"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { scorecardRatings, scorecards } from "@/db/schema";
import { requireUser } from "@/lib/auth/guards";
import { calculateWeightedScore } from "@/lib/domain/scorecard";
import { getFeedbackContext } from "@/lib/queries/feedback";
import {
  recommendationValues,
  scorecardSubmissionSchema,
} from "@/lib/validation/scorecard";
import { fail, ok, type ActionResult } from "./result";

export type SaveScorecardResult = ActionResult<{
  status: "draft" | "submitted";
}>;

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
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

/**
 * Save or submit the viewer's own scorecard.
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
  const context = await getFeedbackContext(actor.id, applicationId);
  if (!context) {
    return fail(
      "This application is no longer active at a stage assigned to you.",
    );
  }
  if (context.scorecard?.status === "submitted") {
    return fail(
      "This feedback has already been submitted and cannot be changed.",
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
  if (input.intent === "submit") {
    if (!input.recommendation) {
      return fail("Choose an overall recommendation before submitting.", {
        recommendation: ["Choose a recommendation"],
      });
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
  }

  const rated = input.ratings.filter(
    (rating): rating is typeof rating & { rating: number } =>
      rating.rating !== null,
  );
  const weightedScore =
    input.intent === "submit"
      ? calculateWeightedScore(context.criteria, rated)
      : null;
  const now = new Date();

  try {
    // Scorecard identity/status and the full replacement set of ratings share
    // one PostgreSQL transaction. Any failed rating insert rolls back the
    // scorecard insert/update and the preceding rating deletion with it.
    await db.transaction(async (tx) => {
      const scorecardValues = {
        status:
          input.intent === "submit"
            ? ("submitted" as const)
            : ("draft" as const),
        recommendation: input.recommendation,
        overallScore: weightedScore === null ? null : weightedScore.toFixed(2),
        strengths: input.strengths || null,
        concerns: input.concerns || null,
        notes: input.notes || null,
        submittedAt: input.intent === "submit" ? now : null,
      };

      let scorecardId = context.scorecard?.id;

      if (scorecardId) {
        const [updated] = await tx
          .update(scorecards)
          .set(scorecardValues)
          .where(
            and(
              eq(scorecards.id, scorecardId),
              eq(scorecards.authorId, actor.id),
              eq(scorecards.status, "draft"),
            ),
          )
          .returning({ id: scorecards.id });
        if (!updated) throw new ScorecardAlreadySubmittedError();
      } else {
        const [inserted] = await tx
          .insert(scorecards)
          .values({
            applicationId,
            applicationStageId: context.applicationStageId,
            authorId: actor.id,
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
          // Only a still-draft row may be updated.
          const [updated] = await tx
            .update(scorecards)
            .set(scorecardValues)
            .where(
              and(
                eq(scorecards.applicationStageId, context.applicationStageId),
                eq(scorecards.authorId, actor.id),
                eq(scorecards.status, "draft"),
              ),
            )
            .returning({ id: scorecards.id });
          if (!updated) throw new ScorecardAlreadySubmittedError();
          scorecardId = updated.id;
        }
      }

      await tx
        .delete(scorecardRatings)
        .where(eq(scorecardRatings.scorecardId, scorecardId));

      if (rated.length > 0) {
        await tx.insert(scorecardRatings).values(
          rated.map((rating) => ({
            scorecardId,
            criterionId: rating.criterionId,
            rating: rating.rating,
            comment: rating.comment || null,
          })),
        );
      }
    });
  } catch (error) {
    if (error instanceof ScorecardAlreadySubmittedError) {
      return fail(
        "This feedback has already been submitted and cannot be changed.",
      );
    }
    throw error;
  }

  revalidatePath("/agenda");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/applications/${applicationId}/feedback`);
  return ok({ status: input.intent === "submit" ? "submitted" : "draft" });
}
