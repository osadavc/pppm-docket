"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  applications,
  applicationStages,
  candidates,
  positionStageInterviewers,
  positionStages,
  scorecards,
} from "@/db/schema";
import { requireRole } from "@/lib/auth/guards";
import {
  submitScorecardSchema,
  type SubmitScorecardInput,
} from "@/lib/validation/scorecard";
import { fail, ok, type ActionResult } from "./result";

/**
 * Submit feedback for the candidate's current stage.
 *
 * The application id is untrusted client input, so the authorization join is
 * performed again here. An interviewer can only create or update their own
 * scorecard while they remain assigned to the candidate's current panel.
 */
export async function submitScorecard(
  input: SubmitScorecardInput,
): Promise<ActionResult<{ stageName: string }>> {
  const actor = await requireRole("interviewer");
  const parsed = submitScorecardSchema.safeParse(input);
  if (!parsed.success) return fail("Check your feedback and try again.");

  const { applicationId, recommendation, strengths, concerns, notes } = parsed.data;
  const [context] = await db
    .select({
      applicationStageId: applicationStages.id,
      stageName: positionStages.name,
      candidateName: candidates.fullName,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(positionStages, eq(positionStages.id, applications.currentStageId))
    .innerJoin(
      applicationStages,
      and(
        eq(applicationStages.applicationId, applications.id),
        eq(applicationStages.positionStageId, applications.currentStageId),
      ),
    )
    .innerJoin(
      positionStageInterviewers,
      and(
        eq(positionStageInterviewers.positionStageId, applications.currentStageId),
        eq(positionStageInterviewers.userId, actor.id),
      ),
    )
    .where(and(eq(applications.id, applicationId), eq(applications.status, "active")))
    .limit(1);

  if (!context) {
    return fail(
      "You can submit feedback only while you are assigned to the candidate's current stage.",
    );
  }

  const submittedAt = new Date();
  await db
    .insert(scorecards)
    .values({
      applicationId,
      applicationStageId: context.applicationStageId,
      authorId: actor.id,
      status: "submitted",
      recommendation,
      strengths: strengths || null,
      concerns: concerns || null,
      notes: notes || null,
      submittedAt,
    })
    // One row per interviewer per stage: submitting again deliberately edits
    // that feedback rather than inflating the advancement gate's count.
    .onConflictDoUpdate({
      target: [scorecards.applicationStageId, scorecards.authorId],
      set: {
        status: "submitted",
        recommendation,
        strengths: strengths || null,
        concerns: concerns || null,
        notes: notes || null,
        submittedAt,
        updatedAt: submittedAt,
      },
    });

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/my-applications");
  return ok({ stageName: context.stageName });
}
