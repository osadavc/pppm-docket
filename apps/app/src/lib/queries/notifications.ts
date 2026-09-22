import "server-only";

import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications, user } from "@/db/schema";
import type { NotificationStatus, NotificationType } from "@/db/schema/enums";
import type { SessionUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";

export type ApplicationEmail = {
  id: string;
  type: NotificationType;
  status: NotificationStatus;
  /** True while a provider call ended without a verdict; retry reconciles. */
  outcomeUnknown: boolean;
  recipientEmail: string;
  deliveryEmail: string | null;
  redirected: boolean;
  subject: string;
  body: string;
  actorName: string | null;
  attemptCount: number;
  createdAt: Date;
  lastAttemptAt: Date | null;
  sentAt: Date | null;
  providerMessageId: string | null;
  error: string | null;
};

/**
 * Every message recorded for an application, newest first. Candidate mail is
 * between HR and the candidate: interviewers get nothing, enforced here rather
 * than in the component.
 */
export async function listNotificationsForApplication(
  applicationId: string,
  viewer: SessionUser,
): Promise<ApplicationEmail[]> {
  if (!viewer.isActive || !can(viewer.role, "application:view")) return [];

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      status: notifications.status,
      recipientEmail: notifications.recipientEmail,
      deliveryEmail: notifications.deliveryEmail,
      subject: notifications.subject,
      body: notifications.body,
      actorName: user.name,
      attemptCount: notifications.attemptCount,
      createdAt: notifications.createdAt,
      lastAttemptAt: notifications.lastAttemptAt,
      sentAt: notifications.sentAt,
      providerMessageId: notifications.providerMessageId,
      error: notifications.error,
      metadata: notifications.metadata,
    })
    .from(notifications)
    .leftJoin(user, eq(user.id, notifications.actorId))
    .where(eq(notifications.applicationId, applicationId))
    .orderBy(desc(notifications.createdAt));

  return rows.map(({ metadata, ...row }) => ({
    ...row,
    outcomeUnknown: metadata?.outcome === "unknown",
    redirected: metadata?.redirected === true,
  }));
}
