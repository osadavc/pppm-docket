import "server-only";

import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { db, type Db } from "@/db/client";
import { notifications } from "@/db/schema";
import type { NotificationStatus, NotificationType } from "@/db/schema/enums";
import { env } from "@/env";
import { COMPANY_NAME } from "@/lib/company";
import { composeHtml } from "./templates";
import {
  logSimulatedEmail,
  planDelivery,
  sendThroughTransport,
  senderAddress,
  type EmailTransport,
} from "./transport";

type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * A message HR has approved, written to the outbox *inside* the transaction
 * that makes the decision it announces. If the decision rolls back, so does
 * the intent; nothing is ever dispatched for a decision that did not happen.
 */
export type NotificationIntent = {
  type: NotificationType;
  applicationId: string;
  candidateId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  /** The HR user who approved the message; null when the candidate's own
   *  action (a public application) triggered it. */
  actorId: string | null;
  metadata?: Record<string, unknown>;
};

export function idempotencyKeyFor(notificationId: string) {
  return `notification/${notificationId}`;
}

export async function recordNotification(
  tx: Tx,
  intent: NotificationIntent,
): Promise<{ id: string }> {
  // The id is chosen here so the idempotency key derived from it can be
  // written in the same row: the audit record shows what the provider will be
  // told, and every retry of this row tells it the same thing.
  const id = crypto.randomUUID();
  const [row] = await tx
    .insert(notifications)
    .values({
      id,
      type: intent.type,
      recipientEmail: intent.recipientEmail,
      recipientCandidateId: intent.candidateId,
      applicationId: intent.applicationId,
      actorId: intent.actorId,
      subject: intent.subject,
      body: intent.body,
      status: "queued",
      metadata: {
        ...(intent.metadata ?? {}),
        originalRecipient: intent.recipientEmail,
        idempotencyKey: idempotencyKeyFor(id),
      },
    })
    .returning({ id: notifications.id });

  return row;
}

export type DispatchOutcome = {
  notificationId: string;
  status: "sent" | "simulated" | "failed" | "unknown" | "skipped";
  /** Set for failed/unknown, and for skipped (why no attempt was made). */
  error?: string;
  /** False when the outcome could not be written back to the outbox row. */
  persisted: boolean;
};

/** A claim older than this is presumed crashed and may be taken over. */
const STALE_CLAIM_MS = 15 * 60 * 1000;

function claimable(notificationId: string, staleBefore: Date) {
  return and(
    eq(notifications.id, notificationId),
    or(
      inArray(notifications.status, ["queued", "failed"]),
      // A crashed or timed-out dispatch left the row claimed. Once its
      // provider call can no longer be in flight it may be reconciled.
      and(
        eq(notifications.status, "dispatching"),
        or(
          lte(notifications.lastAttemptAt, staleBefore),
          sql`${notifications.metadata} ->> 'outcome' = 'unknown'`,
        ),
      ),
    ),
  );
}

async function currentStatus(notificationId: string) {
  const [row] = await db
    .select({ status: notifications.status, metadata: notifications.metadata })
    .from(notifications)
    .where(eq(notifications.id, notificationId));
  return row ?? null;
}

function skipReason(status: NotificationStatus | undefined) {
  if (!status) return "That notification no longer exists.";
  if (status === "sent") return "This email has already been sent.";
  if (status === "simulated") return "This email was recorded as simulated.";
  if (status === "dispatching") return "Another dispatch is still in progress.";
  return "This email cannot be dispatched right now.";
}

async function loadTransport(): Promise<EmailTransport> {
  // Loaded on demand so the SDK is never pulled into a request that ends up
  // simulating, and so tests never need it.
  const { Resend } = await import("resend");
  return new Resend(env.RESEND_API_KEY).emails;
}

/**
 * Deliver one committed notification and record what happened.
 *
 * Exactly one dispatcher can claim a row at a time; the claim is the only
 * concurrency control needed because the provider is given a key derived from
 * the row id. Every path returns a structured outcome — including the case
 * where the provider answered but the outbox could not be updated, which is
 * reported rather than swallowed so the caller can surface "check the Emails
 * panel" instead of pretending everything is fine.
 */
export async function dispatchNotification(
  notificationId: string,
  options: { transport?: EmailTransport } = {},
): Promise<DispatchOutcome> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);

  let claimed:
    | { recipientEmail: string; subject: string; body: string }
    | undefined;
  try {
    [claimed] = await db
      .update(notifications)
      .set({
        status: "dispatching",
        attemptCount: sql`${notifications.attemptCount} + 1`,
        lastAttemptAt: now,
        deliveryEmail: null,
        providerMessageId: null,
        providerResult: null,
        error: null,
        sentAt: null,
        metadata: sql`COALESCE(${notifications.metadata}, '{}'::jsonb) - 'outcome' - 'redirected'`,
      })
      .where(claimable(notificationId, staleBefore))
      .returning({
        recipientEmail: notifications.recipientEmail,
        subject: notifications.subject,
        body: notifications.body,
      });
  } catch (error) {
    return {
      notificationId,
      status: "failed",
      error: `Could not claim the notification: ${error instanceof Error ? error.message : String(error)}`,
      persisted: false,
    };
  }

  if (!claimed) {
    const existing = await currentStatus(notificationId);
    return {
      notificationId,
      status: "skipped",
      error: skipReason(existing?.status),
      persisted: true,
    };
  }

  const plan = planDelivery(
    {
      enabled: env.NOTIFICATIONS_ENABLED,
      apiKeyConfigured: Boolean(env.RESEND_API_KEY) || Boolean(options.transport),
      redirectTo: env.DEMO_EMAIL_REDIRECT,
    },
    claimed.recipientEmail,
  );
  const redirectMetadata = plan.redirected
    ? { redirected: true, originalRecipient: claimed.recipientEmail }
    : { redirected: false };

  const persist = async (values: PgUpdateSetSource<typeof notifications>) => {
    const [updated] = await db
      .update(notifications)
      .set(values)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.status, "dispatching"),
        ),
      )
      .returning({ id: notifications.id });
    if (!updated) throw new Error("The claimed notification row is gone.");
  };

  if (plan.mode === "simulated") {
    logSimulatedEmail({ to: plan.to, subject: claimed.subject });
    try {
      await persist({
        status: "simulated",
        deliveryEmail: plan.to,
        providerResult: {
          provider: "simulated",
          outcome: "simulated",
          reason: plan.reason,
          externalDelivery: false,
        },
        metadata: sql`COALESCE(${notifications.metadata}, '{}'::jsonb) || ${JSON.stringify({ ...redirectMetadata, outcome: "simulated", simulatedBecause: plan.reason })}::jsonb`,
      });
      return { notificationId, status: "simulated", persisted: true };
    } catch (error) {
      return {
        notificationId,
        status: "simulated",
        error: error instanceof Error ? error.message : String(error),
        persisted: false,
      };
    }
  }

  const outcome = await sendThroughTransport(
    options.transport ?? (await loadTransport()),
    {
      from: senderAddress(COMPANY_NAME, env.EMAIL_FROM),
      to: plan.to,
      subject: claimed.subject,
      text: claimed.body,
      html: composeHtml(claimed.body, COMPANY_NAME),
      idempotencyKey: idempotencyKeyFor(notificationId),
    },
  );

  try {
    if (outcome.kind === "sent") {
      await persist({
        status: "sent",
        deliveryEmail: plan.to,
        providerMessageId: outcome.providerMessageId,
        providerResult: outcome.raw,
        sentAt: new Date(),
        error: null,
        metadata: sql`COALESCE(${notifications.metadata}, '{}'::jsonb) || ${JSON.stringify({ ...redirectMetadata, outcome: "sent" })}::jsonb`,
      });
      return { notificationId, status: "sent", persisted: true };
    }

    if (outcome.kind === "failed") {
      await persist({
        status: "failed",
        deliveryEmail: plan.to,
        providerResult: outcome.raw,
        error: outcome.message.slice(0, 2000),
        metadata: sql`COALESCE(${notifications.metadata}, '{}'::jsonb) || ${JSON.stringify({ ...redirectMetadata, outcome: "failed" })}::jsonb`,
      });
      return { notificationId, status: "failed", error: outcome.message, persisted: true };
    }

    // Unknown: leave the row claimed so nobody sends a fresh copy, but mark
    // it so a deliberate retry can reconcile through the same idempotency key.
    await persist({
      deliveryEmail: plan.to,
      providerResult: outcome.raw,
      error: `Provider outcome unknown: ${outcome.message}`.slice(0, 2000),
      metadata: sql`COALESCE(${notifications.metadata}, '{}'::jsonb) || ${JSON.stringify({ ...redirectMetadata, outcome: "unknown" })}::jsonb`,
    });
    return { notificationId, status: "unknown", error: outcome.message, persisted: true };
  } catch (error) {
    // The decision is already committed and the provider has already been
    // told. Report the persistence failure; the row stays "dispatching" and
    // becomes reclaimable once the stale window passes.
    console.error(
      `[email] could not record outcome for notification ${notificationId}:`,
      error,
    );
    return {
      notificationId,
      status: outcome.kind === "sent" ? "sent" : "unknown",
      error: `Delivery outcome was not recorded: ${error instanceof Error ? error.message : String(error)}`,
      persisted: false,
    };
  }
}
