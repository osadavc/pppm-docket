"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";
import type { CandidateEmailDeliveryStatus } from "@/lib/domain/candidate-email";
import { dispatchNotification, recordNotification } from "@/lib/notifications/send";
import { getApplicationHeader } from "@/lib/queries/activity";
import { customEmailSchema, type CustomEmailInput } from "@/lib/validation/application";
import { fail, ok, type ActionResult } from "./result";

/**
 * A free-form message from HR to a candidate, recorded like every other
 * message: written to the outbox first, dispatched after commit, and left in
 * the log whatever the provider says. HR only, management may read the log
 * but not write to candidates from it.
 */
export async function sendCustomCandidateEmail(
  input: CustomEmailInput,
): Promise<
  ActionResult<{
    notificationId: string;
    status: CandidateEmailDeliveryStatus;
    error?: string;
  }>
> {
  const actor = await requirePermission("application:manage");

  const parsed = customEmailSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Check the subject and message.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const { applicationId, subject, body } = parsed.data;

  const header = await getApplicationHeader(applicationId);
  if (!header) return fail("That application no longer exists.");

  const { id } = await db.transaction((tx) =>
    recordNotification(tx, {
      type: "custom",
      applicationId,
      candidateId: header.candidateId,
      recipientEmail: header.candidateEmail,
      subject,
      body,
      actorId: actor.id,
      metadata: { template: "custom" },
    }),
  );

  const outcome = await dispatchNotification(id);
  revalidatePath(`/applications/${applicationId}`);

  if (!outcome.persisted) {
    return fail(
      `The message was recorded but its outcome could not be saved: ${outcome.error ?? "unknown error"}. Check the Emails panel.`,
    );
  }
  return ok({
    notificationId: id,
    status: outcome.status === "skipped" ? "queued" : outcome.status,
    error: outcome.error,
  });
}

/**
 * Re-attempt a failed candidate email.
 *
 * The same outbox row is reused, so the provider sees the same idempotency
 * key it saw the first time: a retry after an unknown outcome reconciles
 * against the earlier attempt instead of sending a second copy. The claim
 * inside `dispatchNotification` is what stops two people retrying at once.
 */
export async function retryNotification(input: {
  notificationId: string;
}): Promise<
  ActionResult<{ status: "sent" | "simulated" | "failed" | "unknown"; error?: string }>
> {
  await requirePermission("application:manage");

  const parsed = z.object({ notificationId: z.uuid() }).safeParse(input);
  if (!parsed.success) return fail("That notification is not valid.");

  const [existing] = await db
    .select({
      status: notifications.status,
      applicationId: notifications.applicationId,
      lastAttemptAt: notifications.lastAttemptAt,
      metadata: notifications.metadata,
    })
    .from(notifications)
    .where(eq(notifications.id, parsed.data.notificationId));
  if (!existing) return fail("That notification no longer exists.");

  if (existing.status === "sent") return fail("This email has already been sent.");
  if (existing.status === "simulated") {
    return fail("This email was simulated, not sent, so there is nothing to retry.");
  }

  const outcome = await dispatchNotification(parsed.data.notificationId);
  if (existing.applicationId) {
    revalidatePath(`/applications/${existing.applicationId}`);
  }

  if (outcome.status === "skipped") {
    return fail(outcome.error ?? "This email cannot be retried right now.");
  }
  if (!outcome.persisted) {
    return fail(
      `The provider was contacted but the outcome could not be recorded: ${outcome.error ?? "unknown error"}. Check the Emails panel before retrying again.`,
    );
  }
  return ok({ status: outcome.status, error: outcome.error });
}
