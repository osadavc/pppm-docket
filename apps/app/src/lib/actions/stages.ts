"use server";

import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  applications,
  applicationStages,
  candidates,
  positionStageInterviewers,
  positionStages,
  user,
} from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { requirePermission } from "@/lib/auth/guards";
import {
  createStageSchema,
  archiveStageSchema,
  reorderStagesSchema,
  setStageInterviewersSchema,
  updateStageSchema,
  type CreateStageInput,
  type ArchiveStageInput,
  type SetStageInterviewersInput,
  type UpdateStageInput,
} from "@/lib/validation/stage";
import { fail, ok, type ActionResult } from "./result";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * When a stage is added to a position that already has candidates, every
 * existing application needs a row for it — otherwise the new stage is
 * invisible to people already in the pipeline and they could never be moved
 * into it.
 */
async function backfillApplicationStages(
  tx: Tx,
  positionId: string,
  stageId: string,
  orderIndex: number,
) {
  const existing = await tx
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.positionId, positionId));

  if (existing.length === 0) return 0;

  // An archived stage keeps its application_stages rows — that is what
  // preserves the history — so restoring it must only fill the genuine gaps.
  const alreadyHave = await tx
    .select({ applicationId: applicationStages.applicationId })
    .from(applicationStages)
    .where(eq(applicationStages.positionStageId, stageId));
  const have = new Set(alreadyHave.map((r) => r.applicationId));

  const missing = existing.filter((a) => !have.has(a.id));
  if (missing.length === 0) return 0;

  await tx.insert(applicationStages).values(
    missing.map((a) => ({
      applicationId: a.id,
      positionStageId: stageId,
      orderIndex,
      status: "pending" as const,
    })),
  );
  return missing.length;
}

/**
 * Keep each candidate’s copied stage order in step with the position’s.
 * application_stages carries its own orderIndex so a candidate’s history
 * survives later edits, which means a reorder has to update both.
 */
async function syncApplicationStageOrder(tx: Tx, positionId: string) {
  const stages = await tx
    .select({ id: positionStages.id, orderIndex: positionStages.orderIndex })
    .from(positionStages)
    .where(
      and(
        eq(positionStages.positionId, positionId),
        eq(positionStages.isArchived, false),
      ),
    );

  for (const s of stages) {
    await tx
      .update(applicationStages)
      .set({ orderIndex: s.orderIndex })
      .where(eq(applicationStages.positionStageId, s.id));
  }
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

    // Candidates already in the pipeline need a row for the new stage.
    const backfilled = await backfillApplicationStages(tx, positionId, row!.id, next);

    await logActivity(tx, {
      actorId: actor.id,
      action: "position.stage_added",
      entityType: "position",
      entityId: positionId,
      positionId,
      summary:
        backfilled > 0
          ? `${actor.name} added the stage “${fields.name}” and applied it to ${backfilled} candidate${backfilled === 1 ? "" : "s"} already in progress`
          : `${actor.name} added the stage “${fields.name}”`,
      metadata: { stageName: fields.name, orderIndex: next, backfilled },
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

  const current = await db
    .select({ id: positionStages.id })
    .from(positionStages)
    .where(
      and(
        eq(positionStages.positionId, positionId),
        eq(positionStages.isArchived, false),
      ),
    )
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

    await syncApplicationStageOrder(tx, positionId);

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

/**
 * Retire a stage without losing anything.
 *
 * Archiving rather than deleting is the whole point: scorecards submitted at
 * this stage, and the record of candidates who passed through it, stay exactly
 * where they are. The stage simply leaves the active pipeline.
 *
 * If the stage is currently holding active candidates, a destination must be
 * named — leaving people parked on a retired stage is precisely the silent
 * data loss this is meant to avoid. Every forced move is written to that
 * candidate's history individually.
 */
export async function archiveStage(
  input: ArchiveStageInput,
): Promise<ActionResult<{ moved: number; needsDestination?: never }>> {
  const actor = await requirePermission("position:stages:manage");

  const parsed = archiveStageSchema.safeParse(input);
  if (!parsed.success) return fail("That request is not valid.");
  const { stageId, destinationStageId } = parsed.data;

  const stage = await db.query.positionStages.findFirst({
    where: eq(positionStages.id, stageId),
  });
  if (!stage) return fail("That stage no longer exists.");
  if (stage.isArchived) return fail("That stage is already archived.");

  const active = await db
    .select({ count: count() })
    .from(positionStages)
    .where(
      and(
        eq(positionStages.positionId, stage.positionId),
        eq(positionStages.isArchived, false),
      ),
    );
  if ((active[0]?.count ?? 0) <= 1) {
    return fail("A position needs at least one active stage.");
  }

  // Who is sitting on this stage right now?
  const occupants = await db
    .select({
      applicationId: applications.id,
      candidateName: candidates.fullName,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .where(
      and(eq(applications.currentStageId, stageId), eq(applications.status, "active")),
    );

  if (occupants.length > 0 && !destinationStageId) {
    return fail(
      `${occupants.length} active candidate${occupants.length === 1 ? " is" : "s are"} on this stage. Choose the stage to move ${occupants.length === 1 ? "them" : "them all"} to.`,
    );
  }

  let destination: typeof stage | undefined;
  if (destinationStageId) {
    destination = await db.query.positionStages.findFirst({
      where: eq(positionStages.id, destinationStageId),
    });
    if (
      !destination ||
      destination.positionId !== stage.positionId ||
      destination.id === stage.id ||
      destination.isArchived
    ) {
      return fail("Choose an active stage on this position to move candidates to.");
    }
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    for (const occupant of occupants) {
      // The destination row may not exist if the stage predates this
      // application; make sure there is one before pointing at it.
      const [existingRow] = await tx
        .select({ id: applicationStages.id })
        .from(applicationStages)
        .where(
          and(
            eq(applicationStages.applicationId, occupant.applicationId),
            eq(applicationStages.positionStageId, destination!.id),
          ),
        );

      let destinationRowId = existingRow?.id;
      if (!destinationRowId) {
        const [inserted] = await tx
          .insert(applicationStages)
          .values({
            applicationId: occupant.applicationId,
            positionStageId: destination!.id,
            orderIndex: destination!.orderIndex,
          })
          .returning({ id: applicationStages.id });
        destinationRowId = inserted!.id;
      }

      // The stage they are leaving is marked skipped, not deleted — the row and
      // any feedback on it remain part of their history.
      await tx
        .update(applicationStages)
        .set({ status: "skipped", completedAt: now, decidedById: actor.id })
        .where(
          and(
            eq(applicationStages.applicationId, occupant.applicationId),
            eq(applicationStages.positionStageId, stageId),
          ),
        );

      await tx
        .update(applicationStages)
        .set({ status: "in_progress", enteredAt: now })
        .where(eq(applicationStages.id, destinationRowId));

      await tx
        .update(applications)
        .set({ currentStageId: destination!.id })
        .where(eq(applications.id, occupant.applicationId));

      // One entry per candidate, on that candidate's own timeline.
      await logActivity(tx, {
        actorId: actor.id,
        action: "application.stage_force_moved",
        entityType: "application",
        entityId: occupant.applicationId,
        applicationId: occupant.applicationId,
        positionId: stage.positionId,
        summary: `${occupant.candidateName} was moved from “${stage.name}” to “${destination!.name}” because “${stage.name}” was archived`,
        metadata: {
          fromStageId: stageId,
          fromStageName: stage.name,
          toStageId: destination!.id,
          toStageName: destination!.name,
          forced: true,
        },
      });
    }

    await tx
      .update(positionStages)
      .set({ isArchived: true, archivedAt: now })
      .where(eq(positionStages.id, stageId));

    // Close the gap so the remaining active stages stay contiguous.
    const remaining = await tx
      .select({ id: positionStages.id })
      .from(positionStages)
      .where(
        and(
          eq(positionStages.positionId, stage.positionId),
          eq(positionStages.isArchived, false),
        ),
      )
      .orderBy(asc(positionStages.orderIndex));

    for (const [index, s] of remaining.entries()) {
      await tx
        .update(positionStages)
        .set({ orderIndex: index })
        .where(eq(positionStages.id, s.id));
    }
    await syncApplicationStageOrder(tx, stage.positionId);

    await logActivity(tx, {
      actorId: actor.id,
      action: "position.stage_archived",
      entityType: "position",
      entityId: stage.positionId,
      positionId: stage.positionId,
      summary: `${actor.name} archived the stage “${stage.name}”${occupants.length > 0 ? ` and moved ${occupants.length} candidate${occupants.length === 1 ? "" : "s"} to “${destination!.name}”` : ""}`,
      metadata: {
        stageId,
        stageName: stage.name,
        movedCount: occupants.length,
        destinationStageId: destination?.id ?? null,
      },
    });
  });

  revalidatePath(`/positions/${stage.positionId}`);
  revalidatePath(`/positions/${stage.positionId}/stages`);
  return ok({ moved: occupants.length });
}

/** Bring an archived stage back into the active pipeline, at the end. */
export async function unarchiveStage(stageId: string): Promise<ActionResult<void>> {
  const actor = await requirePermission("position:stages:manage");

  const stage = await db.query.positionStages.findFirst({
    where: eq(positionStages.id, stageId),
  });
  if (!stage) return fail("That stage no longer exists.");
  if (!stage.isArchived) return fail("That stage is not archived.");

  await db.transaction(async (tx) => {
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${positionStages.orderIndex}), -1) + 1` })
      .from(positionStages)
      .where(
        and(
          eq(positionStages.positionId, stage.positionId),
          eq(positionStages.isArchived, false),
        ),
      );

    await tx
      .update(positionStages)
      .set({ isArchived: false, archivedAt: null, orderIndex: next })
      .where(eq(positionStages.id, stageId));

    await backfillApplicationStages(tx, stage.positionId, stageId, next);
    await syncApplicationStageOrder(tx, stage.positionId);

    await logActivity(tx, {
      actorId: actor.id,
      action: "position.stage_restored",
      entityType: "position",
      entityId: stage.positionId,
      positionId: stage.positionId,
      summary: `${actor.name} restored the stage “${stage.name}”`,
      metadata: { stageId, stageName: stage.name },
    });
  });

  revalidatePath(`/positions/${stage.positionId}`);
  revalidatePath(`/positions/${stage.positionId}/stages`);
  return ok(undefined);
}
