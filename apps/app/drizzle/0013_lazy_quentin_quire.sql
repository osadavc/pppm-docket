ALTER TABLE "scorecards" ADD COLUMN "revision_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Revision 1 has already been backfilled by the earlier immutable-history
-- migration. Keep the denormalized counter truthful for those existing rows.
UPDATE "scorecards" scorecard
SET "revision_count" = COALESCE(
  (
    SELECT MAX(revision."revision_number")
    FROM "scorecard_revisions" revision
    WHERE revision."scorecard_id" = scorecard."id"
  ),
  0
);
