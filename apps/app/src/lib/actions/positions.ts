"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  positions,
  positionStages,
  scorecardCriteria,
  stageTemplateSets,
} from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { requirePermission, requireRole } from "@/lib/auth/guards";
import { DEFAULT_STAGES } from "@/lib/domain/default-stages";
import {
  canTransition,
  transitionError,
} from "@/lib/domain/position-status";
import { getFillSummary, positionHasApplications } from "@/lib/queries/positions";
import type { PositionStatus } from "@/db/schema/enums";
import {
  approvePositionSchema,
  normalizePositionInput,
  positionDraftSchema,
  rejectPositionSchema,
  closePositionSchema,
  type ApprovePositionInput,
  type ClosePositionInput,
  type PositionDraftInput,
  type RejectPositionInput,
} from "@/lib/validation/position";
import { fail, ok, type ActionResult } from "./result";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Copy a pipeline onto a brand new position.
 *
 * Prefers the stage template set flagged `isDefault`; falls back to
 * DEFAULT_STAGES so a position is never created without a usable pipeline.
 * Either way the stages are COPIED — the position owns them from here on, so
 * customising this pipeline never affects another position or a template.
 */
async function seedStages(tx: Tx, positionId: string) {
  const template = await tx.query.stageTemplateSets.findFirst({
    where: eq(stageTemplateSets.isDefault, true),
    with: {
      stages: {
        orderBy: (s, { asc: ascending }) => [ascending(s.orderIndex)],
        with: { criteria: true },
      },
    },
  });

  const source =
    template && template.stages.length > 0
      ? template.stages.map((s) => ({
          name: s.name,
          description: s.description,
          kind: s.kind,
          requiresScorecard: s.requiresScorecard,
          minScorecards: s.minScorecards,
          slaDays: s.slaDays,
          criteria: s.criteria
            .slice()
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((c) => ({
              label: c.label,
              description: c.description,
              weight: c.weight,
            })),
        }))
      : DEFAULT_STAGES;

  const inserted = await tx
    .insert(positionStages)
    .values(
      source.map((stage, index) => ({
        positionId,
        name: stage.name,
        description: stage.description,
        orderIndex: index,
        kind: stage.kind,
        requiresScorecard: stage.requiresScorecard,
        minScorecards: stage.minScorecards,
        slaDays: stage.slaDays,
      })),
    )
    .returning({ id: positionStages.id });

  const criteriaRows = source.flatMap((stage, stageIndex) =>
    stage.criteria.map((criterion, criterionIndex) => ({
      positionStageId: inserted[stageIndex]!.id,
      label: criterion.label,
      description: criterion.description,
      weight: criterion.weight,
      orderIndex: criterionIndex,
    })),
  );

  if (criteriaRows.length > 0) {
    await tx.insert(scorecardCriteria).values(criteriaRows);
  }

  return { stageCount: inserted.length, source: template ? "template" : "default" };
}

export async function createDraftPosition(
  input: PositionDraftInput,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requireRole("hr");

  const parsed = positionDraftSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Check the highlighted fields.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const d = normalizePositionInput(parsed.data);

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(positions)
      .values({
        ...d,
        createdById: actor.id,
        // Always a draft. Advertising it is a separate, deliberate step.
        status: "draft",
      })
      .returning({ id: positions.id });

    const position = row!;
    const seeded = await seedStages(tx, position.id);

    await logActivity(tx, {
      actorId: actor.id,
      action: "position.created",
      entityType: "position",
      entityId: position.id,
      positionId: position.id,
      summary: `${actor.name} created draft position “${d.title}” with ${seeded.stageCount} interview stages`,
      metadata: { department: d.department, stageSource: seeded.source },
    });

    return position;
  });

  revalidatePath("/positions");
  return ok({ id: created.id });
}

/** Drafts are freely editable; once live, edits are still allowed but audited. */
export async function updatePosition(
  positionId: string,
  input: PositionDraftInput,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requireRole("hr");

  const parsed = positionDraftSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Check the highlighted fields.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const d = normalizePositionInput(parsed.data);

  const existing = await db.query.positions.findFirst({
    where: eq(positions.id, positionId),
  });
  if (!existing) return fail("That position no longer exists.");

  await db.transaction(async (tx) => {
    await tx
      .update(positions)
      .set(d)
      .where(eq(positions.id, positionId));

    await logActivity(tx, {
      actorId: actor.id,
      action: "position.updated",
      entityType: "position",
      entityId: positionId,
      positionId,
      summary: `${actor.name} edited ${existing.status === "draft" ? "draft " : ""}position “${d.title}”`,
      metadata: { status: existing.status },
    });
  });

  revalidatePath("/positions");
  revalidatePath(`/positions/${positionId}`);
  return ok({ id: positionId });
}

/** Exposed for the stages story; kept here so the guard lives with the writes. */
export async function canEditStagesDestructively(positionId: string) {
  return !(await positionHasApplications(positionId));
}


/**
 * The ONLY place `positions.status` is written.
 *
 * Every status change goes through the transition map, so no action can move a
 * position somewhere the lifecycle forbids — in particular draft -> open.
 * Returns the guard failure rather than throwing so callers can surface it.
 */
async function transitionStatus(
  tx: Tx,
  positionId: string,
  from: PositionStatus,
  to: PositionStatus,
  extra: Partial<typeof positions.$inferInsert> = {},
) {
  if (!canTransition(from, to)) {
    return { ok: false as const, error: transitionError(from, to) };
  }
  await tx
    .update(positions)
    .set({ status: to, ...extra })
    .where(eq(positions.id, positionId));
  return { ok: true as const };
}

/**
 * Put a draft forward for management sign-off.
 *
 * Records who submitted it and when, so the approval queue can show the
 * requester and the audit trail survives later status changes.
 */
export async function submitPositionForApproval(
  positionId: string,
): Promise<ActionResult<{ id: string; status: PositionStatus }>> {
  const actor = await requirePermission("position:submit");

  const existing = await db.query.positions.findFirst({
    where: eq(positions.id, positionId),
  });
  if (!existing) return fail("That position no longer exists.");

  if (existing.status === "pending_approval") {
    return fail("This position is already awaiting approval.");
  }

  // A role should not be put forward with nothing in it for management to read.
  const missing: string[] = [];
  if (!existing.description.trim()) missing.push("a job description");
  if (!existing.applicationDeadline) missing.push("an application deadline");
  if (missing.length > 0) {
    return fail(
      `Add ${missing.join(" and ")} before submitting this position for approval.`,
    );
  }

  const result = await db.transaction(async (tx) => {
    const moved = await transitionStatus(tx, positionId, existing.status, "pending_approval", {
      submittedById: actor.id,
      submittedAt: new Date(),
    });
    if (!moved.ok) return moved;

    await logActivity(tx, {
      actorId: actor.id,
      action: "position.submitted_for_approval",
      entityType: "position",
      entityId: positionId,
      positionId,
      summary: `${actor.name} submitted “${existing.title}” for management approval`,
      metadata: { from: existing.status, to: "pending_approval" },
    });

    return { ok: true as const };
  });

  if (!result.ok) return fail(result.error);

  revalidatePath("/positions");
  revalidatePath(`/positions/${positionId}`);
  revalidatePath("/positions/approvals");
  return ok({ id: positionId, status: "pending_approval" });
}

/**
 * Approve a submitted position: it opens and becomes visible on the careers
 * board in the same transaction. `openedAt` is stamped here because it is the
 * moment the role actually went live, which the ageing report depends on.
 */
export async function approvePosition(
  input: ApprovePositionInput,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requirePermission("position:approve");

  const parsed = approvePositionSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Check the highlighted fields.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const { positionId, note } = parsed.data;

  const existing = await db.query.positions.findFirst({
    where: eq(positions.id, positionId),
  });
  if (!existing) return fail("That position no longer exists.");
  if (existing.status !== "pending_approval") {
    return fail("Only a position awaiting approval can be approved.");
  }

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const moved = await transitionStatus(tx, positionId, existing.status, "open", {
      openedAt: now,
      lastReviewDecision: "approved",
      reviewedById: actor.id,
      reviewedAt: now,
      reviewNote: note || null,
    });
    if (!moved.ok) return moved;

    await logActivity(tx, {
      actorId: actor.id,
      action: "position.approved",
      entityType: "position",
      entityId: positionId,
      positionId,
      summary: `${actor.name} approved “${existing.title}” — it is now open and on the careers board`,
      metadata: {
        from: existing.status,
        to: "open",
        note: note || null,
        submittedById: existing.submittedById,
      },
    });

    return { ok: true as const };
  });

  if (!result.ok) return fail(result.error);

  revalidatePath("/positions");
  revalidatePath(`/positions/${positionId}`);
  revalidatePath("/positions/approvals");
  revalidatePath("/careers");
  return ok({ id: positionId });
}

/**
 * Reject a submitted position: it returns to draft carrying the manager's note,
 * so HR sees exactly what to fix rather than having to ask.
 */
export async function rejectPosition(
  input: RejectPositionInput,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requirePermission("position:approve");

  const parsed = rejectPositionSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "A note is required when rejecting.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const { positionId, note } = parsed.data;

  const existing = await db.query.positions.findFirst({
    where: eq(positions.id, positionId),
  });
  if (!existing) return fail("That position no longer exists.");
  if (existing.status !== "pending_approval") {
    return fail("Only a position awaiting approval can be rejected.");
  }

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const moved = await transitionStatus(tx, positionId, existing.status, "draft", {
      lastReviewDecision: "rejected",
      reviewedById: actor.id,
      reviewedAt: now,
      reviewNote: note,
    });
    if (!moved.ok) return moved;

    await logActivity(tx, {
      actorId: actor.id,
      action: "position.rejected",
      entityType: "position",
      entityId: positionId,
      positionId,
      summary: `${actor.name} rejected “${existing.title}” and returned it to draft`,
      metadata: {
        from: existing.status,
        to: "draft",
        note,
        submittedById: existing.submittedById,
      },
    });

    return { ok: true as const };
  });

  if (!result.ok) return fail(result.error);

  revalidatePath("/positions");
  revalidatePath(`/positions/${positionId}`);
  revalidatePath("/positions/approvals");
  return ok({ id: positionId });
}

/**
 * End a position's life: filled, closed or cancelled.
 *
 * The under-hire case is deliberately NOT blocked. A role is often filled with
 * fewer people than were budgeted, and refusing to record reality would push
 * HR into leaving positions open forever. The shortfall is returned so the UI
 * can warn before confirming, and it is written to the audit trail either way.
 */
export async function closePosition(
  input: ClosePositionInput,
): Promise<ActionResult<{ id: string; status: PositionStatus; shortfall: number }>> {
  const actor = await requirePermission("position:manage");

  const parsed = closePositionSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Check the highlighted fields.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const { positionId, status, note } = parsed.data;

  const existing = await db.query.positions.findFirst({
    where: eq(positions.id, positionId),
  });
  if (!existing) return fail("That position no longer exists.");

  const summary = await getFillSummary(positionId);
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    // closedAt is the moment the search ended — time-to-fill is measured from
    // openedAt to here, so it must be stamped on every terminal outcome.
    const moved = await transitionStatus(tx, positionId, existing.status, status, {
      closedAt: now,
      closureNote: note || null,
    });
    if (!moved.ok) return moved;

    const outcome =
      status === "filled"
        ? summary.shortfall > 0
          ? `filled with ${summary.hired} of ${summary.openings} openings`
          : `filled all ${summary.openings} opening${summary.openings === 1 ? "" : "s"}`
        : status === "cancelled"
          ? "cancelled before hiring"
          : "closed";

    await logActivity(tx, {
      actorId: actor.id,
      action: `position.${status}`,
      entityType: "position",
      entityId: positionId,
      positionId,
      summary: `${actor.name} marked “${existing.title}” ${outcome}`,
      metadata: {
        from: existing.status,
        to: status,
        note: note || null,
        openings: summary.openings,
        hired: summary.hired,
        shortfall: summary.shortfall,
        activeCandidatesAtClose: summary.activeCandidates,
      },
    });

    return { ok: true as const };
  });

  if (!result.ok) return fail(result.error);

  revalidatePath("/positions");
  revalidatePath(`/positions/${positionId}`);
  revalidatePath("/careers");
  return ok({ id: positionId, status, shortfall: summary.shortfall });
}
