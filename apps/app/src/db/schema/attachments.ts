import { check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { applications } from "./applications";
import { user } from "./auth";
import { candidates } from "./candidates";
import { attachmentKind } from "./enums";
import { positions } from "./positions";
import { createdAt, updatedAt } from "./_shared";

/**
 * Files live in a PRIVATE Supabase Storage bucket; access is only ever through
 * a signed URL minted by an authorized route handler.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: attachmentKind("kind").default("cv").notNull(),
    candidateId: uuid("candidate_id").references(() => candidates.id, {
      onDelete: "cascade",
    }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    positionId: uuid("position_id").references(() => positions.id, {
      onDelete: "cascade",
    }),
    bucket: text("bucket").default("candidate-files").notNull(),
    /** e.g. candidates/{candidateId}/{uuid}-cv.pdf */
    storagePath: text("storage_path").notNull().unique(),
    /** Original name, used for Content-Disposition on download. */
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedById: text("uploaded_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "attachments_owner_check",
      sql`${t.candidateId} is not null or ${t.applicationId} is not null or ${t.positionId} is not null`,
    ),
    index("attachments_candidate_idx").on(t.candidateId),
    index("attachments_application_idx").on(t.applicationId),
    index("attachments_position_idx").on(t.positionId),
  ],
);

export type Attachment = typeof attachments.$inferSelect;
