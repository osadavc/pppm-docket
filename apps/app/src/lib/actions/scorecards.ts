"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { scorecardRatings, scorecards } from "@/db/schema";
import { requireUser } from "@/lib/auth/guards";
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
      "Check the feedback fields and try again.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
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
      );
    }
  }

  const rated = input.ratings.filter(
    (rating): rating is typeof rating & { rating: number } =>
      rating.rating !== null,
  );
  const weights = new Map(
    context.criteria.map((criterion) => [
      criterion.id,
      criterion.weight > 0 ? criterion.weight : 1,
    ]),
  );
  const totalWeight = rated.reduce(
    (sum, rating) => sum + (weights.get(rating.criterionId) ?? 1),
    0,
  );
  const weightedScore =
    input.intent === "submit" && totalWeight > 0
      ? rated.reduce(
          (sum, rating) =>
            sum + rating.rating * (weights.get(rating.criterionId) ?? 1),
          0,
        ) / totalWeight
      : null;
  const now = new Date();

  try {
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
