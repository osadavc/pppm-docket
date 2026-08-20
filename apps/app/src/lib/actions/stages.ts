"use server";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  positionStageInterviewers,
  positionStages,
  scorecardCriteria,
  user,
} from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { requirePermission } from "@/lib/auth/guards";
import { positionHasApplications } from "@/lib/queries/positions";
import {
  createStageSchema,
  deleteStageSchema,
  reorderStagesSchema,
  setStageInterviewersSchema,
  updateStageSchema,
  type CreateStageInput,
  type SetStageInterviewersInput,
  type UpdateStageInput,
} from "@/lib/validation/stage";
import { fail, ok, type ActionResult } from "./result";

/**
 * Structural edits — adding, removing or reordering stages — are only safe
 * while no one is in the pipeline. Once an application exists, its
 * `application_stages` rows carry a copied orderIndex, and reshaping the
 * pipeline underneath a live candidate would silently rewrite where they are.
 * Naming and per-stage settings stay editable regardless.
 */
async function assertPipelineIsUnlocked(positionId: string) {
  if (await positionHasApplications(positionId)) {
    return "Candidates have already applied, so stages can no longer be added, removed or reordered. You can still rename them.";
  }
  return null;
}

const slaOrNull = (v: number | "" | undefined) => (v === "" || v === undefined ? null : v);

export async function createStage(
  input: CreateStageInput,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requirePermission("position:stages:manage");

  const parsed = createStageSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Check the highlighted fields.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const { positionId, slaDays, ...fields } = parsed.data;

  const locked = await assertPipelineIsUnlocked(positionId);
  if (locked) return fail(locked);

  const created = await db.transaction(async (tx) => {
    // Append to the end: one past the current highest index.
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${positionStages.orderIndex}), -1) + 1` })
      .from(positionStages)
      .where(eq(positionStages.positionId, positionId));

    const [row] = await tx
      .insert(positionStages)
      .values({
        positionId,
        orderIndex: next,
        slaDays: slaOrNull(slaDays),
        ...fields,
      })
      .returning({ id: positionStages.id });

    await logActivity(tx, {
      actorId: actor.id,
      action: "position.stage_added",
      entityType: "position",
      entityId: positionId,
      positionId,
      summary: `${actor.name} added the stage “${fields.name}”`,
      metadata: { stageName: fields.name, orderIndex: next },
    });

    return row!;
  });

  revalidatePath(`/positions/${positionId}`);
  revalidatePath(`/positions/${positionId}/stages`);
  return ok({ id: created.id });
}

export async function updateStage(
  input: UpdateStageInput,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requirePermission("position:stages:manage");

  const parsed = updateStageSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Check the highlighted fields.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const { stageId, slaDays, ...fields } = parsed.data;

  const existing = await db.query.positionStages.findFirst({
    where: eq(positionStages.id, stageId),
  });
  if (!existing) return fail("That stage no longer exists.");

  await db.transaction(async (tx) => {
    await tx
      .update(positionStages)
      .set({ slaDays: slaOrNull(slaDays), ...fields })
      .where(eq(positionStages.id, stageId));

    await logActivity(tx, {
      actorId: actor.id,
      action: "position.stage_updated",
      entityType: "position",
      entityId: existing.positionId,
      positionId: existing.positionId,
      summary:
        existing.name === fields.name
          ? `${actor.name} updated the stage “${fields.name}”`
          : `${actor.name} renamed the stage “${existing.name}” to “${fields.name}”`,
      metadata: { from: existing.name, to: fields.name },
    });
  });

  revalidatePath(`/positions/${existing.positionId}`);
  revalidatePath(`/positions/${existing.positionId}/stages`);
  return ok({ id: stageId });
}

/**
 * Rewrite every stage's order from its position in the submitted array.
 *
 * Never a pairwise swap: `(positionId, orderIndex)` is a plain index rather
 * than unique precisely so a whole-list rewrite cannot collide mid-statement,
 * and rewriting from array position means the result cannot end up with gaps
 * or duplicates however the UI got there.
 */
export async function reorderStages(
  positionId: string,
  orderedStageIds: string[],
): Promise<ActionResult<{ count: number }>> {
  const actor = await requirePermission("position:stages:manage");

  const parsed = reorderStagesSchema.safeParse({ positionId, orderedStageIds });
  if (!parsed.success) return fail("That ordering is not valid.");

  const locked = await assertPipelineIsUnlocked(positionId);
  if (locked) return fail(locked);

  const current = await db
    .select({ id: positionStages.id })
    .from(positionStages)
    .where(eq(positionStages.positionId, positionId))
    .orderBy(asc(positionStages.orderIndex));

  const currentIds = current.map((s) => s.id);
  const submitted = parsed.data.orderedStageIds;

  // The submitted list must be a permutation of this position's stages —
  // otherwise a crafted request could reorder or orphan another position's.
  const sameSet =
    submitted.length === currentIds.length &&
    new Set(submitted).size === submitted.length &&
    submitted.every((id) => currentIds.includes(id));
  if (!sameSet) return fail("That ordering does not match this position's stages.");

  await db.transaction(async (tx) => {
    for (const [index, id] of submitted.entries()) {
      await tx
        .update(positionStages)
        .set({ orderIndex: index })
        .where(and(eq(positionStages.id, id), eq(positionStages.positionId, positionId)));
    }

    await logActivity(tx, {
      actorId: actor.id,
      action: "position.stages_reordered",
      entityType: "position",
      entityId: positionId,
      positionId,
      summary: `${actor.name} reordered the interview stages`,
      metadata: { order: submitted },
    });
  });

  revalidatePath(`/positions/${positionId}`);
  revalidatePath(`/positions/${positionId}/stages`);
  return ok({ count: submitted.length });
}

export async function deleteStage(stageId: string): Promise<ActionResult<void>> {
  const actor = await requirePermission("position:stages:manage");

  const parsed = deleteStageSchema.safeParse({ stageId });
  if (!parsed.success) return fail("That stage is not valid.");

  const existing = await db.query.positionStages.findFirst({
    where: eq(positionStages.id, stageId),
  });
  if (!existing) return fail("That stage no longer exists.");

  const locked = await assertPipelineIsUnlocked(existing.positionId);
  if (locked) return fail(locked);

  const remaining = await db
    .select({ id: positionStages.id })
    .from(positionStages)
    .where(eq(positionStages.positionId, existing.positionId));
  if (remaining.length <= 1) {
    return fail("A position needs at least one interview stage.");
  }

  await db.transaction(async (tx) => {
    await tx.delete(scorecardCriteria).where(eq(scorecardCriteria.positionStageId, stageId));
    await tx.delete(positionStages).where(eq(positionStages.id, stageId));

    // Close the gap left behind so indexes stay contiguous.
    const rest = await tx
      .select({ id: positionStages.id })
      .from(positionStages)
      .where(eq(positionStages.positionId, existing.positionId))
      .orderBy(asc(positionStages.orderIndex));

    for (const [index, s] of rest.entries()) {
      await tx
        .update(positionStages)
        .set({ orderIndex: index })
        .where(eq(positionStages.id, s.id));
    }

    await logActivity(tx, {
      actorId: actor.id,
      action: "position.stage_removed",
      entityType: "position",
      entityId: existing.positionId,
      positionId: existing.positionId,
      summary: `${actor.name} removed the stage “${existing.name}”`,
      metadata: { stageName: existing.name },
    });
  });

  revalidatePath(`/positions/${existing.positionId}`);
  revalidatePath(`/positions/${existing.positionId}/stages`);
  return ok(undefined);
}


/**
 * Replace a stage's standing interview panel.
 *
 * Sent as the whole desired list rather than add/remove deltas so the result
 * cannot drift from what the manager saw on screen. Clearing the panel entirely
 * is deliberately allowed — a stage with nobody assigned simply stops gating
 * advancement rather than blocking candidates behind an empty panel.
 *
 * Unlike adding or reordering stages, this stays editable after candidates
 * arrive: panels change when people join, leave or go on holiday, and the
 * pipeline shape is untouched.
 */
export async function setStageInterviewers(
  input: SetStageInterviewersInput,
): Promise<ActionResult<{ assigned: number }>> {
  const actor = await requirePermission("position:stages:manage");

  const parsed = setStageInterviewersSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Check the highlighted fields.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const { stageId, userIds } = parsed.data;
  const desired = [...new Set(userIds)];

  const stage = await db.query.positionStages.findFirst({
    where: eq(positionStages.id, stageId),
  });
  if (!stage) return fail("That stage no longer exists.");

  if (desired.length > 0) {
    const found = await db
      .select({ id: user.id })
      .from(user)
      .where(and(inArray(user.id, desired), eq(user.isActive, true)));
    if (found.length !== desired.length) {
      return fail("One of those people is no longer an active user.");
    }
  }

  const current = await db
    .select({ userId: positionStageInterviewers.userId })
    .from(positionStageInterviewers)
    .where(eq(positionStageInterviewers.positionStageId, stageId));
  const currentIds = new Set(current.map((c) => c.userId));

  const added = desired.filter((id) => !currentIds.has(id));
  const removed = [...currentIds].filter((id) => !desired.includes(id));

  if (added.length === 0 && removed.length === 0) {
    return ok({ assigned: desired.length });
  }

  await db.transaction(async (tx) => {
    if (removed.length > 0) {
      await tx
        .delete(positionStageInterviewers)
        .where(
          and(
            eq(positionStageInterviewers.positionStageId, stageId),
            inArray(positionStageInterviewers.userId, removed),
          ),
        );
    }
    if (added.length > 0) {
      await tx
        .insert(positionStageInterviewers)
        .values(added.map((userId) => ({ positionStageId: stageId, userId })));
    }

    await logActivity(tx, {
      actorId: actor.id,
      action: "position.stage_panel_changed",
      entityType: "position",
      entityId: stage.positionId,
      positionId: stage.positionId,
      summary: `${actor.name} set ${desired.length} interviewer${desired.length === 1 ? "" : "s"} on the stage “${stage.name}”`,
      metadata: { stageId, added, removed, panelSize: desired.length },
    });
  });

  revalidatePath(`/positions/${stage.positionId}`);
  revalidatePath(`/positions/${stage.positionId}/stages`);
  return ok({ assigned: desired.length });
}
