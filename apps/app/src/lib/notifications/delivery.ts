import "server-only";

import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { env } from "@/env";
import type { CandidateEmailDeliveryStatus } from "@/lib/domain/candidate-email";

async function markFailed(notificationId: string, message: string) {
  await db
    .update(notifications)
    .set({ status: "failed", error: message.slice(0, 2000) })
    .where(eq(notifications.id, notificationId));
}

/**
 * Deliver one already-committed notification.
 *
 * Local/demo environments deliberately stop at `queued`, giving automated
 * checks a durable outbox row without contacting a real mailbox. Production
 * can redirect all mail to one safe address while retaining the intended
 * candidate recipient in the audit record.
 */
export async function deliverCandidateEmail(
  notificationId: string,
): Promise<CandidateEmailDeliveryStatus> {
  if (!env.NOTIFICATIONS_ENABLED) return "queued";

  try {
    const [notification] = await db
      .select({
        recipientEmail: notifications.recipientEmail,
        subject: notifications.subject,
        body: notifications.body,
        status: notifications.status,
      })
      .from(notifications)
      .where(eq(notifications.id, notificationId));

    if (!notification || notification.status !== "queued") return "failed";
    if (!env.RESEND_API_KEY) {
      await markFailed(notificationId, "RESEND_API_KEY is not configured");
      return "failed";
    }

    const recipient = env.DEMO_EMAIL_REDIRECT || notification.recipientEmail;
    const { data, error } = await new Resend(env.RESEND_API_KEY).emails.send({
      from: env.EMAIL_FROM,
      to: recipient,
      subject: notification.subject,
      text: notification.body,
    });

    if (error) {
      await markFailed(notificationId, error.message);
      return "failed";
    }

    await db
      .update(notifications)
      .set({
        status: "sent",
        providerMessageId: data?.id ?? null,
        sentAt: new Date(),
        error: null,
      })
      .where(eq(notifications.id, notificationId));
    return "sent";
  } catch (error) {
    try {
      await markFailed(
        notificationId,
        error instanceof Error ? error.message : "Unknown email provider error",
      );
    } catch {
      // The pipeline transaction is already committed. Delivery status must
      // not turn a successful pipeline action into an apparent action failure.
    }
    return "failed";
  }
}
