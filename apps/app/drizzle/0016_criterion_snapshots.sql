-- Ratings carry the criterion label and weight as they read at submission,
-- so editing live criteria can never relabel or rescore past assessments.
ALTER TABLE "scorecard_ratings" ADD COLUMN "criterion_label" text;--> statement-breakpoint
ALTER TABLE "scorecard_ratings" ADD COLUMN "criterion_weight" integer;--> statement-breakpoint
ALTER TABLE "scorecard_revision_ratings" ADD COLUMN "criterion_label" text;--> statement-breakpoint
ALTER TABLE "scorecard_revision_ratings" ADD COLUMN "criterion_weight" integer;--> statement-breakpoint
-- Existing rows predate any criterion edits, so today's live values are the
-- values they were rated against.
UPDATE "scorecard_ratings" r SET "criterion_label" = c."label", "criterion_weight" = c."weight"
FROM "scorecard_criteria" c WHERE c."id" = r."criterion_id";--> statement-breakpoint
UPDATE "scorecard_revision_ratings" r SET "criterion_label" = c."label", "criterion_weight" = c."weight"
FROM "scorecard_criteria" c WHERE c."id" = r."criterion_id";
