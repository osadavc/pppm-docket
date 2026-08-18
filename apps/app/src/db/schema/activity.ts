import { bigserial, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { desc } from "drizzle-orm";
import { applications } from "./applications";
import { user } from "./auth";
import { positions } from "./positions";
import { createdAt } from "./_shared";

/** Append-only audit trail. Written inside the same transaction as the mutation. */
export const activityLog = pgTable(
  "activity_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Null means the system acted. */
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    /** Dotted verb, e.g. application.advanced, interview.scheduled. */
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /** Denormalized so an application timeline is one query. */
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    positionId: uuid("position_id").references(() => positions.id, {
      onDelete: "set null",
    }),
    /** Pre-rendered human sentence. */
    summary: text("summary").notNull(),
    /** before/after, override reason, missing-feedback list. */
    metadata: jsonb("metadata"),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_log_application_idx").on(t.applicationId, desc(t.createdAt)),
    index("activity_log_position_idx").on(t.positionId, desc(t.createdAt)),
    index("activity_log_entity_idx").on(t.entityType, t.entityId),
    index("activity_log_created_idx").on(desc(t.createdAt)),
  ],
);

export type ActivityEntry = typeof activityLog.$inferSelect;
export type NewActivityEntry = typeof activityLog.$inferInsert;
