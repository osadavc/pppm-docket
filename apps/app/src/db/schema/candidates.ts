import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { candidateSource } from "./enums";
import { createdAt, updatedAt } from "./_shared";

/**
 * A global person record, not a per-position row. The same person genuinely
 * applies to two roles, or gets rejected for one and revived for another six
 * months later. Everything position-specific lives on `applications`.
 * Candidates never log in — they are data, not users.
 */
export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    /** Stored lowercased; the unique index is what powers dedupe on add. */
    email: text("email").notNull(),
    phone: text("phone"),
    location: text("location"),
    linkedinUrl: text("linkedin_url"),
    currentTitle: text("current_title"),
    currentCompany: text("current_company"),
    source: candidateSource("source").default("other").notNull(),
    referredById: text("referred_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("candidates_email_unique").on(t.email),
    index("candidates_full_name_idx").on(t.fullName),
  ],
);

export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;
