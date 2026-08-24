"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { applications, applicationStages } from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { getAdvanceContext } from "@/lib/queries/applications";
import {
  advanceApplicationSchema,
  type AdvanceApplicationInput,
} from "@/lib/validation/application";
import { fail, ok, type ActionResult } from "./result";

/**
 * Move a candidate on to the next stage.
 *
 * The advance context is re-read here rather than trusted from the page that
 * rendered the button: a Server Action is a public endpoint, and the pipeline
 * may have been reshaped since the page was drawn.
 */
export async function advanceApplication(
  input: AdvanceApplicationInput,
): Promise<ActionResult<{ toStageId: string; toStageName: string }>> {
  const actor = await requirePermission("application:manage");

  const parsed = advanceApplicationSchema.safeParse(input);
  if (!parsed.success) return fail("That request is not valid.");
  const { applicationId, note, overrideReason } = parsed.data;

  const context = await getAdvanceContext(applicationId);
  if (!context) return fail("That application no longer exists.");

  if (context.status !== "active") {
    return fail(
      `${context.candidateName} is ${context.status.replace("_", " ")}, so they cannot be advanced.`,
    );
  }
  if (!context.currentStage) {
    return fail("That candidate is not on a stage.");
  }

  // AC: there is nothing after the last stage — the decision at the end of a
  // pipeline is an outcome, not another step.
  if (!context.nextStage) {
    return fail(
      `${context.candidateName} is at the final stage (${context.currentStage.name}). Hire or reject them instead of advancing.`,
    );
  }

  if (context.gate.blocked) {
    const waitingOn =
      context.outstandingInterviewers.length > 0
        ? ` Waiting on ${context.outstandingInterviewers.join(", ")}.`
        : "";

    if (!overrideReason) {
      return fail(
        `${context.gate.outstanding} more scorecard${context.gate.outstanding === 1 ? "" : "s"} needed before leaving ${context.currentStage.name}.${waitingOn}`,
      );
    }
    if (!can(actor.role, "application:override-gate")) {
      return fail("You are not allowed to override the feedback requirement.");
    }
  }

  const overridden = context.gate.blocked && Boolean(overrideReason);
  const now = new Date();
  const from = context.currentStage;
  const to = context.nextStage;

  await db.transaction(async (tx) => {
    await tx
      .update(applicationStages)
      .set({
        status: "passed",
        completedAt: now,
        decidedById: actor.id,
        ...(note ? { notes: note } : {}),
      })
      .where(
        and(
          eq(applicationStages.applicationId, applicationId),
          eq(applicationStages.positionStageId, from.id),
        ),
      );

    // The destination row may be missing if the stage was added after this
    // candidate applied; create it rather than failing.
    const [destination] = await tx
      .select({ id: applicationStages.id })
      .from(applicationStages)
      .where(
        and(
          eq(applicationStages.applicationId, applicationId),
          eq(applicationStages.positionStageId, to.id),
        ),
      );

    if (destination) {
      await tx
        .update(applicationStages)
        .set({ status: "in_progress", enteredAt: now, completedAt: null })
        .where(eq(applicationStages.id, destination.id));
    } else {
      await tx.insert(applicationStages).values({
        applicationId,
        positionStageId: to.id,
        orderIndex: to.orderIndex,
        status: "in_progress",
        enteredAt: now,
      });
    }

    await tx
      .update(applications)
      .set({ currentStageId: to.id })
      .where(eq(applications.id, applicationId));

    // Who, from where, to where, and when — on the candidate's own timeline.
    await logActivity(tx, {
      actorId: actor.id,
      action: overridden ? "application.advanced.override" : "application.advanced",
      entityType: "application",
      entityId: applicationId,
      applicationId,
      positionId: context.positionId,
      summary: `${actor.name} advanced ${context.candidateName} from “${from.name}” to “${to.name}”${overridden ? ", overriding the feedback requirement" : ""}`,
      metadata: {
        fromStageId: from.id,
        fromStageName: from.name,
        toStageId: to.id,
        toStageName: to.name,
        movedAt: now.toISOString(),
        note: note ?? null,
        overridden,
        overrideReason: overrideReason ?? null,
        outstandingInterviewers: overridden ? context.outstandingInterviewers : [],
      },
    });
  });

  revalidatePath(`/candidates`);
  revalidatePath(`/positions/${context.positionId}/pipeline`);
  return ok({ toStageId: to.id, toStageName: to.name });
}
