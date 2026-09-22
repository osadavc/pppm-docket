import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { tstz } from "./_shared";

/**
 * Fixed-window counters for unauthenticated endpoints. Kept in Postgres so
 * the limit holds across every deployed instance, an in-process map would
 * give each replica its own allowance.
 */
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  /** e.g. `public-apply:203.0.113.9` */
  key: text("key").primaryKey(),
  hits: integer("hits").notNull(),
  windowStartedAt: tstz("window_started_at").notNull(),
});
