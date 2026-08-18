import { timestamp } from "drizzle-orm/pg-core";

/**
 * Every domain timestamp is timezone-aware. An interview time without a
 * timezone is wrong for anyone not on the server's clock, and "when is my
 * interview" is the one thing this app must not get wrong.
 */
export const tstz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

export const createdAt = () => tstz("created_at").defaultNow().notNull();

export const updatedAt = () =>
  tstz("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());
