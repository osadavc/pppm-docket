"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { applications, applicationStages, positionStages } from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { getAdvanceContext } from "@/lib/queries/applications";
import {
  advanceApplicationSchema,
  holdApplicationSchema,
  moveBackSchema,
  resumeApplicationSchema,
  skipStageSchema,
  type AdvanceApplicationInput,
  type HoldApplicationInput,
  type MoveBackInput,
  type ResumeApplicationInput,
  type SkipStageInput,
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

type StageRef = { id: string; name: string; orderIndex: number };

/** The live pipeline, in order — archived stages are not valid destinations. */
async function livePipeline(positionId: string): Promise<StageRef[]> {
  return db
    .select({
      id: positionStages.id,
      name: positionStages.name,
      orderIndex: positionStages.orderIndex,
    })
    .from(positionStages)
    .where(
      and(
        eq(positionStages.positionId, positionId),
        eq(positionStages.isArchived, false),
      ),
    )
    .orderBy(asc(positionStages.orderIndex));
}

/**
 * Point an application at a stage, creating its row if the stage was added
 * after the candidate applied. Shared by every exceptional move so they all
 * leave the same shape of record behind.
 */
async function enterStage(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  applicationId: string,
  stage: StageRef,
  at: Date,
) {
  const [existing] = await tx
    .select({ id: applicationStages.id })
    .from(applicationStages)
    .where(
      and(
        eq(applicationStages.applicationId, applicationId),
        eq(applicationStages.positionStageId, stage.id),
      ),
    );

  if (existing) {
    await tx
      .update(applicationStages)
      .set({ status: "in_progress", enteredAt: at, completedAt: null })
      .where(eq(applicationStages.id, existing.id));
  } else {
    await tx.insert(applicationStages).values({
      applicationId,
      positionStageId: stage.id,
      orderIndex: stage.orderIndex,
      status: "in_progress",
      enteredAt: at,
    });
  }

  await tx
    .update(applications)
    .set({ currentStageId: stage.id })
    .where(eq(applications.id, applicationId));
}

/**
 * Move a candidate past a stage without it being assessed.
 *
 * Distinct from advancing: the stage is recorded as `skipped`, not `passed`,
 * so the record never implies feedback that was never given. The feedback gate
 * is intentionally not consulted — skipping is the exception to it.
 */
export async function skipStage(
  input: SkipStageInput,
): Promise<ActionResult<{ toStageName: string }>> {
  const actor = await requirePermission("application:override-flow");

  const parsed = skipStageSchema.safeParse(input);
  if (!parsed.success) return fail("That request is not valid.");
  const { applicationId, note } = parsed.data;

  const context = await getAdvanceContext(applicationId);
  if (!context) return fail("That application no longer exists.");
  if (context.status !== "active") {
    return fail(`${context.candidateName} is not active, so their stage cannot be skipped.`);
  }
  if (!context.currentStage) return fail("That candidate is not on a stage.");
  if (!context.nextStage) {
    return fail(
      `${context.candidateName} is at the final stage (${context.currentStage.name}). Hire or reject them instead.`,
    );
  }

  const now = new Date();
  const from = context.currentStage;
  const to = context.nextStage;

  await db.transaction(async (tx) => {
    await tx
      .update(applicationStages)
      .set({
        status: "skipped",
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

    await enterStage(tx, applicationId, to, now);

    await logActivity(tx, {
      actorId: actor.id,
      action: "application.stage_skipped",
      entityType: "application",
      entityId: applicationId,
      applicationId,
      positionId: context.positionId,
      summary: `${actor.name} skipped “${from.name}” for ${context.candidateName}, moving them to “${to.name}”`,
      metadata: {
        fromStageId: from.id,
        fromStageName: from.name,
        toStageId: to.id,
        toStageName: to.name,
        movedAt: now.toISOString(),
        note: note ?? null,
      },
    });
  });

  revalidatePath("/candidates");
  revalidatePath(`/positions/${context.positionId}/pipeline`);
  return ok({ toStageName: to.name });
}

/**
 * Send a candidate back to an earlier stage.
 *
 * The stage they are leaving returns to `pending` rather than being marked
 * passed or failed — they are genuinely no longer there, and nothing about
 * their earlier progress should be rewritten. Feedback already submitted at
 * either stage is untouched.
 */
export async function moveApplicationBack(
  input: MoveBackInput,
): Promise<ActionResult<{ toStageName: string }>> {
  const actor = await requirePermission("application:override-flow");

  const parsed = moveBackSchema.safeParse(input);
  if (!parsed.success) return fail("That request is not valid.");
  const { applicationId, toStageId, note } = parsed.data;

  const context = await getAdvanceContext(applicationId);
  if (!context) return fail("That application no longer exists.");
  if (context.status !== "active") {
    return fail(`${context.candidateName} is not active, so they cannot be moved back.`);
  }
  if (!context.currentStage) return fail("That candidate is not on a stage.");

  const pipeline = await livePipeline(context.positionId);
  const earlier = pipeline.filter((s) => s.orderIndex < context.currentStage!.orderIndex);
  if (earlier.length === 0) {
    return fail(
      `${context.candidateName} is already at the first stage (${context.currentStage.name}).`,
    );
  }

  const to = toStageId
    ? earlier.find((s) => s.id === toStageId)
    : earlier[earlier.length - 1];
  if (!to) {
    return fail("Choose an earlier stage on this position to move them back to.");
  }

  const now = new Date();
  const from = context.currentStage;

  await db.transaction(async (tx) => {
    await tx
      .update(applicationStages)
      .set({
        status: "pending",
        enteredAt: null,
        completedAt: null,
        decidedById: actor.id,
        ...(note ? { notes: note } : {}),
      })
      .where(
        and(
          eq(applicationStages.applicationId, applicationId),
          eq(applicationStages.positionStageId, from.id),
        ),
      );

    await enterStage(tx, applicationId, to, now);

    await logActivity(tx, {
      actorId: actor.id,
      action: "application.moved_back",
      entityType: "application",
      entityId: applicationId,
      applicationId,
      positionId: context.positionId,
      summary: `${actor.name} moved ${context.candidateName} back from “${from.name}” to “${to.name}”`,
      metadata: {
        fromStageId: from.id,
        fromStageName: from.name,
        toStageId: to.id,
        toStageName: to.name,
        movedAt: now.toISOString(),
        note: note ?? null,
      },
    });
  });

  revalidatePath("/candidates");
  revalidatePath(`/positions/${context.positionId}/pipeline`);
  return ok({ toStageName: to.name });
}

/**
 * Park a candidate without losing their place.
 *
 * They keep their stage; only the application status changes, which is what
 * takes them out of active pipeline counts. Nothing about their history moves.
 */
export async function holdApplication(
  input: HoldApplicationInput,
): Promise<ActionResult<void>> {
  const actor = await requirePermission("application:override-flow");

  const parsed = holdApplicationSchema.safeParse(input);
  if (!parsed.success) return fail("That request is not valid.");
  const { applicationId, note } = parsed.data;

  const context = await getAdvanceContext(applicationId);
  if (!context) return fail("That application no longer exists.");
  if (context.status === "on_hold") {
    return fail(`${context.candidateName} is already on hold.`);
  }
  if (context.status !== "active") {
    return fail(`${context.candidateName} is ${context.status.replace("_", " ")} and cannot be put on hold.`);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(applications)
      .set({ status: "on_hold" })
      .where(eq(applications.id, applicationId));

    await logActivity(tx, {
      actorId: actor.id,
      action: "application.held",
      entityType: "application",
      entityId: applicationId,
      applicationId,
      positionId: context.positionId,
      summary: `${actor.name} put ${context.candidateName} on hold at “${context.currentStage?.name ?? "—"}”`,
      metadata: {
        stageId: context.currentStage?.id ?? null,
        stageName: context.currentStage?.name ?? null,
        heldAt: new Date().toISOString(),
        note: note ?? null,
      },
    });
  });

  revalidatePath("/candidates");
  revalidatePath(`/positions/${context.positionId}/pipeline`);
  return ok(undefined);
}

/**
 * Put a held candidate back into the running.
 *
 * Their time-in-stage clock restarts: the pace indicator exists to surface
 * candidates being neglected, and a deliberate hold is the opposite of that.
 * Counting the held period as stalling would flag the pipeline red for having
 * been managed properly.
 */
export async function resumeApplication(
  input: ResumeApplicationInput,
): Promise<ActionResult<void>> {
  const actor = await requirePermission("application:override-flow");

  const parsed = resumeApplicationSchema.safeParse(input);
  if (!parsed.success) return fail("That request is not valid.");
  const { applicationId, note } = parsed.data;

  const context = await getAdvanceContext(applicationId);
  if (!context) return fail("That application no longer exists.");
  if (context.status !== "on_hold") {
    return fail(`${context.candidateName} is not on hold.`);
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(applications)
      .set({ status: "active" })
      .where(eq(applications.id, applicationId));

    if (context.currentStage) {
      await tx
        .update(applicationStages)
        .set({ enteredAt: now })
        .where(
          and(
            eq(applicationStages.applicationId, applicationId),
            eq(applicationStages.positionStageId, context.currentStage.id),
          ),
        );
    }

    await logActivity(tx, {
      actorId: actor.id,
      action: "application.resumed",
      entityType: "application",
      entityId: applicationId,
      applicationId,
      positionId: context.positionId,
      summary: `${actor.name} resumed ${context.candidateName} at “${context.currentStage?.name ?? "—"}”`,
      metadata: {
        stageId: context.currentStage?.id ?? null,
        stageName: context.currentStage?.name ?? null,
        resumedAt: now.toISOString(),
        timeInStageReset: true,
        note: note ?? null,
      },
    });
  });

  revalidatePath("/candidates");
  revalidatePath(`/positions/${context.positionId}/pipeline`);
  return ok(undefined);
}
