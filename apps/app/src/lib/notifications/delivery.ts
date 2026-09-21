import "server-only";

import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { env } from "@/env";
import type { CandidateEmailDeliveryStatus } from "@/lib/domain/candidate-email";

export type CandidateEmailProvider = {
  send: (
    message: {
      from: string;
      to: string;
      subject: string;
      text: string;
    },
    options: { idempotencyKey: string },
  ) => Promise<{
    data: { id: string } | null;
    error: {
      name?: string;
      message: string;
      code?: string;
      statusCode?: number | null;
    } | null;
  }>;
};

async function markFailed(
  notificationId: string,
  message: string,
  deliveryEmail: string | null,
  providerResult: Record<string, unknown>,
) {
  await db
    .update(notifications)
    .set({
      status: "failed",
      deliveryEmail,
      providerMessageId: null,
      providerResult,
      error: message.slice(0, 2000),
      sentAt: null,
    })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.status, "dispatching"),
      ),
    );
}

async function existingOutcome(
  notificationId: string,
): Promise<CandidateEmailDeliveryStatus> {
  const [existing] = await db
    .select({ status: notifications.status })
    .from(notifications)
    .where(eq(notifications.id, notificationId));

  if (existing?.status === "sent") return "sent";
  if (existing?.status === "demo") return "demo";
  return "failed";
}

async function recordDemoOutcome(
  notificationId: string,
): Promise<CandidateEmailDeliveryStatus> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 15 * 60 * 1000);
  const redirectedRecipient = env.DEMO_EMAIL_REDIRECT.trim();
  const [recorded] = await db
    .update(notifications)
    .set({
      status: "demo",
      deliveryEmail:
        redirectedRecipient || sql`${notifications.recipientEmail}`,
      providerMessageId: null,
      providerResult: {
        provider: "demo",
        outcome: "demo",
        externalDelivery: false,
        redirected: Boolean(redirectedRecipient),
      },
      error: null,
      attemptCount: sql`${notifications.attemptCount} + 1`,
      lastAttemptAt: now,
      sentAt: null,
    })
    .where(
      and(
        eq(notifications.id, notificationId),
        or(
          inArray(notifications.status, ["queued", "failed"]),
          and(
            eq(notifications.status, "dispatching"),
            lte(notifications.lastAttemptAt, staleBefore),
          ),
        ),
      ),
    )
    .returning({ id: notifications.id });

  return recorded ? "demo" : existingOutcome(notificationId);
}

/**
 * Deliver one already-committed notification.
 *
 * Disabled delivery records an explicit demo outcome without contacting a
 * mailbox. Enabled delivery can redirect all mail to one safe demo address;
 * that provider-backed result is also marked demo while the intended
 * candidate recipient remains immutable in the audit record.
 */
export async function deliverCandidateEmail(
  notificationId: string,
  providerOverride?: CandidateEmailProvider,
): Promise<CandidateEmailDeliveryStatus> {
  if (!env.NOTIFICATIONS_ENABLED) {
    try {
      return await recordDemoOutcome(notificationId);
    } catch {
      return "failed";
    }
  }

  let attemptedRecipient: string | null = null;
  try {
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
    // Claim before contacting the provider. Only one concurrent dispatcher can
    // move a queued/failed row to `dispatching`. A crashed claim can be retried
    // after 15 minutes; Resend receives a stable idempotency key so reconciling
    // a provider-success/database-failure does not send a duplicate message.
    const [notification] = await db
      .update(notifications)
      .set({
        status: "dispatching",
        attemptCount: sql`${notifications.attemptCount} + 1`,
        lastAttemptAt: new Date(),
        deliveryEmail: null,
        providerMessageId: null,
        providerResult: null,
        error: null,
        sentAt: null,
      })
      .where(
        and(
          eq(notifications.id, notificationId),
          or(
            inArray(notifications.status, ["queued", "failed"]),
            and(
              eq(notifications.status, "dispatching"),
              lte(notifications.lastAttemptAt, staleBefore),
            ),
          ),
        ),
      )
      .returning({
        recipientEmail: notifications.recipientEmail,
        subject: notifications.subject,
        body: notifications.body,
      });

    if (!notification) {
      return existingOutcome(notificationId);
    }
    const redirectedRecipient = env.DEMO_EMAIL_REDIRECT.trim();
    attemptedRecipient = redirectedRecipient || notification.recipientEmail;

    if (!env.RESEND_API_KEY && !providerOverride) {
      await markFailed(
        notificationId,
        "RESEND_API_KEY is not configured",
        attemptedRecipient,
        {
          provider: "resend",
          outcome: "failed",
          code: "missing_api_key",
        },
      );
      return "failed";
    }

    const provider: CandidateEmailProvider =
      providerOverride ?? new Resend(env.RESEND_API_KEY).emails;
    const { data, error } = await provider.send(
      {
        from: env.EMAIL_FROM,
        to: attemptedRecipient,
        subject: notification.subject,
        text: notification.body,
      },
      { idempotencyKey: `notification/${notificationId}` },
    );

    if (error) {
      await markFailed(notificationId, error.message, attemptedRecipient, {
        provider: "resend",
        outcome: "failed",
        name: error.name,
        code: error.code,
        statusCode: error.statusCode,
        message: error.message,
      });
      return "failed";
    }

    const outcome = redirectedRecipient ? "demo" : "sent";
    await db
      .update(notifications)
      .set({
        status: outcome,
        deliveryEmail: attemptedRecipient,
        providerMessageId: data?.id ?? null,
        providerResult: {
          provider: "resend",
          outcome,
          id: data?.id ?? null,
          redirected: Boolean(redirectedRecipient),
        },
        sentAt: new Date(),
        error: null,
      })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.status, "dispatching"),
        ),
      );
    return outcome;
  } catch (error) {
    try {
      await markFailed(
        notificationId,
        error instanceof Error ? error.message : "Unknown email provider error",
        attemptedRecipient,
        {
          provider: "resend",
          outcome: "failed",
          message:
            error instanceof Error
              ? error.message
              : "Unknown email provider error",
        },
      );
    } catch {
      // The pipeline transaction is already committed. Delivery status must
      // not turn a successful pipeline action into an apparent action failure.
    }
    return "failed";
  }
}
