import { desc, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { applications } from "./applications";
import { user } from "./auth";
import { candidates } from "./candidates";
import { notificationStatus, notificationType } from "./enums";
import { interviews } from "./interviews";
import { createdAt, tstz, updatedAt } from "./_shared";

/**
 * Every intended message is recorded before dispatch — this is both the audit
 * trail and what makes the feature demonstrable when a mailbox is not on
 * screen. With NOTIFICATIONS_ENABLED=false rows are still written, just never
 * dispatched.
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
    /** The authenticated person who approved this intended message. */
    initiatedById: text("initiated_by_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    subject: text("subject").notNull(),
    /** Rendered snapshot approved for dispatch, retained even on failure. */
    body: text("body").notNull(),
    status: notificationStatus("status").default("queued").notNull(),
    /** Actual provider/demo target; intended recipient remains immutable above. */
    deliveryEmail: text("delivery_email"),
    providerMessageId: text("provider_message_id"),
    /** Normalized provider/demo response retained for reconciliation. */
    providerResult: jsonb("provider_result").$type<
      Record<string, unknown>
    >(),
    error: text("error"),
    /** Incremented when a sender atomically claims this row for dispatch. */
    attemptCount: integer("attempt_count").default(0).notNull(),
    lastAttemptAt: tstz("last_attempt_at"),
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
    index("notifications_initiated_by_idx").on(t.initiatedById),
    index("notifications_application_idx").on(t.applicationId),
    index("notifications_provider_message_idx").on(t.providerMessageId),
    index("notifications_created_idx").on(desc(t.createdAt)),
    check("notifications_attempt_count_check", sql`${t.attemptCount} >= 0`),
  ],
);

export type Notification = typeof notifications.$inferSelect;
