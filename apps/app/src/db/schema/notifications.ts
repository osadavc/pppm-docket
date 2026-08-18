import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { desc } from "drizzle-orm";
import { applications } from "./applications";
import { user } from "./auth";
import { candidates } from "./candidates";
import { notificationStatus, notificationType } from "./enums";
import { interviews } from "./interviews";
import { createdAt, tstz, updatedAt } from "./_shared";

/**
 * Every send is recorded — this is both the audit trail and what makes the
 * feature demonstrable when a mailbox is not on screen. With
 * NOTIFICATIONS_ENABLED=false rows are still written, just never dispatched.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: notificationType("type").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    /** Null for candidates, who are not users. */
    recipientUserId: text("recipient_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    recipientCandidateId: uuid("recipient_candidate_id").references(
      () => candidates.id,
      { onDelete: "set null" },
    ),
    subject: text("subject").notNull(),
    /** Rendered snapshot — what was actually sent. */
    body: text("body").notNull(),
    status: notificationStatus("status").default("queued").notNull(),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    interviewId: uuid("interview_id").references(() => interviews.id, {
      onDelete: "set null",
    }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    sentAt: tstz("sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("notifications_status_idx").on(t.status),
    index("notifications_recipient_user_idx").on(t.recipientUserId),
    index("notifications_application_idx").on(t.applicationId),
    index("notifications_created_idx").on(desc(t.createdAt)),
  ],
);

export type Notification = typeof notifications.$inferSelect;
