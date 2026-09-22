import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { applications, applicationStages } from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import type { SessionUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import type { CandidateEmailDeliveryStatus } from "@/lib/domain/candidate-email";
import { formatNameList } from "@/lib/format";
import {
  dispatchNotification,
  recordNotification,
  type DispatchOutcome,
} from "@/lib/notifications/send";
import type { EmailTransport } from "@/lib/notifications/transport";
import { getAdvanceContext } from "@/lib/queries/applications";
import {
  advanceApplicationSchema,
  rejectApplicationSchema,
  REJECTION_REASON_LABELS,
  type AdvanceApplicationInput,
  type RejectApplicationInput,
} from "@/lib/validation/application";
import { fail, ok, type ActionResult } from "@/lib/actions/result";

/**
 * The decisions that can email a candidate, separated from the Server Action
 * wrappers so the record-before-dispatch contract can be exercised directly:
 * every export here takes an already-authenticated actor and re-checks the
 * permission it needs, and never trusts the page that rendered the button.
 */

export type DecisionEmail = {
  notificationId: string | null;
  status: CandidateEmailDeliveryStatus;
  /** Present when delivery did not end cleanly, for the toast and the panel. */
  error?: string;
};

type DecisionOptions = { transport?: EmailTransport };

export function toDeliveryStatus(outcome: DispatchOutcome): DecisionEmail {
  const status: CandidateEmailDeliveryStatus =
    outcome.status === "skipped" ? "queued" : outcome.status;
  return {
    notificationId: outcome.notificationId,
    status,
    error: outcome.error,
  };
}

export function waitingOnMessage(outstanding: readonly string[]) {
  return outstanding.length > 0
    ? `Waiting on feedback from ${formatNameList(outstanding)}.`
    : "Waiting on interview feedback.";
}

export async function advanceApplicationAs(
  actor: SessionUser,
  input: AdvanceApplicationInput,
  options: DecisionOptions = {},
): Promise<
  ActionResult<{
    applicationId: string;
    positionId: string;
    candidateName: string;
    toStageId: string;
    toStageName: string;
    overridden: boolean;
    email: DecisionEmail;
  }>
> {
  if (!can(actor.role, "application:manage")) {
    return fail("You are not allowed to advance candidates.");
  }

  const parsed = advanceApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Check the stage details, override reason and candidate email.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const { applicationId, note, overrideReason, notification } = parsed.data;

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

  // AC: there is nothing after the last stage, the decision at the end of a
  // pipeline is an outcome, not another step.
  if (!context.nextStage) {
    return fail(
      `${context.candidateName} is at the final stage (${context.currentStage.name}). Hire or reject them instead of advancing.`,
    );
  }

  if (context.gate.blocked) {
    // Refused before anything is written: a blocked advance records no stage
    // change and no email intent.
    if (!overrideReason) {
      return fail(waitingOnMessage(context.outstandingInterviewers));
    }
    if (!can(actor.role, "application:override-gate")) {
      return fail("You are not allowed to override the feedback requirement.");
    }
  }

  const overridden = context.gate.blocked && Boolean(overrideReason);
  const now = new Date();
  const from = context.currentStage;
  const to = context.nextStage;

  const notificationId = await db.transaction(async (tx) => {
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

    // Who, from where, to where, and when, on the candidate's own timeline.
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
        overrideReason: overridden ? overrideReason : null,
        outstandingInterviewers: overridden ? context.outstandingInterviewers : [],
        gateOutstanding: overridden ? context.gate.outstanding : 0,
      },
    });

    if (!notification) return null;
    const queued = await recordNotification(tx, {
      type: "stage_advanced",
      applicationId,
      candidateId: context.candidateId,
      recipientEmail: context.candidateEmail,
      subject: notification.subject,
      body: notification.body,
      actorId: actor.id,
      metadata: { template: "stageAdvanced", toStageId: to.id, toStageName: to.name },
    });
    return queued.id;
  });

  // Provider I/O only starts after the pipeline transaction commits. A failed
  // advancement therefore cannot send or even queue candidate email.
  const email: DecisionEmail = notificationId
    ? toDeliveryStatus(await dispatchNotification(notificationId, options))
    : { notificationId: null, status: "not_requested" };

  return ok({
    applicationId,
    positionId: context.positionId,
    candidateName: context.candidateName,
    toStageId: to.id,
    toStageName: to.name,
    overridden,
    email,
  });
}

export async function rejectApplicationAs(
  actor: SessionUser,
  input: RejectApplicationInput,
  options: DecisionOptions = {},
): Promise<
  ActionResult<{
    applicationId: string;
    positionId: string;
    candidateName: string;
    email: DecisionEmail;
  }>
> {
  if (!can(actor.role, "application:manage")) {
    return fail("You are not allowed to reject candidates.");
  }

  const parsed = rejectApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Check the rejection details and candidate email.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const { applicationId, reason, note, notification } = parsed.data;

  const context = await getAdvanceContext(applicationId);
  if (!context) return fail("That application no longer exists.");
  if (context.status === "rejected") {
    return fail(`${context.candidateName} has already been rejected.`);
  }
  if (context.status === "hired") {
    return fail(`${context.candidateName} has been hired and cannot be rejected.`);
  }

  const now = new Date();

  const notificationId = await db.transaction(async (tx) => {
    await tx
      .update(applications)
      .set({
        status: "rejected",
        rejectionReason: reason,
        // The internal note is never sent; the candidate sees only the email.
        decisionReason: note || null,
        decisionAt: now,
        decisionById: actor.id,
      })
      .where(eq(applications.id, applicationId));

    // The stage they were on is where they dropped out, record that rather
    // than leaving it looking in-progress forever.
    if (context.currentStage) {
      await tx
        .update(applicationStages)
        .set({ status: "failed", completedAt: now, decidedById: actor.id })
        .where(
          and(
            eq(applicationStages.applicationId, applicationId),
            eq(applicationStages.positionStageId, context.currentStage.id),
          ),
        );
    }

    await logActivity(tx, {
      actorId: actor.id,
      action: "application.rejected",
      entityType: "application",
      entityId: applicationId,
      applicationId,
      positionId: context.positionId,
      summary: `${actor.name} rejected ${context.candidateName} at “${context.currentStage?.name ?? "-"}”: ${REJECTION_REASON_LABELS[reason]}`,
      metadata: {
        reason,
        reasonLabel: REJECTION_REASON_LABELS[reason],
        stageId: context.currentStage?.id ?? null,
        stageName: context.currentStage?.name ?? null,
        decidedAt: now.toISOString(),
        note: note ?? null,
        candidateEmailed: Boolean(notification),
      },
    });

    if (!notification) return null;
    const queued = await recordNotification(tx, {
      type: "rejection",
      applicationId,
      candidateId: context.candidateId,
      recipientEmail: context.candidateEmail,
      subject: notification.subject,
      body: notification.body,
      actorId: actor.id,
      metadata: { template: "rejection", rejectionReason: reason },
    });
    return queued.id;
  });

  // Keep the irreversible provider call outside the database transaction, but
  // only after the rejection and its outbox row have committed together.
  const email: DecisionEmail = notificationId
    ? toDeliveryStatus(await dispatchNotification(notificationId, options))
    : { notificationId: null, status: "not_requested" };

  return ok({
    applicationId,
    positionId: context.positionId,
    candidateName: context.candidateName,
    email,
  });
}
