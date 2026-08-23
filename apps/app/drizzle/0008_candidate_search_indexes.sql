-- Search indexes for the candidate list.
--
-- Searching by name or email means substring matching (ILIKE '%term%'), which a
-- btree index cannot serve — it can only help with a left-anchored prefix. A
-- trigram GIN index is what makes an unanchored match indexable, which is the
-- difference between a sequential scan of every candidate and an index scan
-- once a position has a thousand-plus applicants.
--
-- Hand written: drizzle-kit models neither extensions nor operator-class
-- indexes, so this must not be regenerated away.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS candidates_full_name_trgm
  ON candidates USING gin (full_name gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS candidates_email_trgm
  ON candidates USING gin (email gin_trgm_ops);
--> statement-breakpoint
-- Paging is ordered by applied_at, so give the planner an index that already
-- carries that order within a position.
CREATE INDEX IF NOT EXISTS applications_position_applied_idx
  ON applications (position_id, applied_at DESC);
