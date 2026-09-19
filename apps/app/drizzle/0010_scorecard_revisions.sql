CREATE TABLE "scorecard_revision_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scorecard_revision_ratings_range_check" CHECK ("scorecard_revision_ratings"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "scorecard_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scorecard_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"author_id" text NOT NULL,
	"recommendation" "recommendation",
	"overall_score" numeric(4, 2),
	"strengths" text,
	"concerns" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scorecard_revisions_number_check" CHECK ("scorecard_revisions"."revision_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "scorecard_revision_ratings" ADD CONSTRAINT "scorecard_revision_ratings_revision_id_scorecard_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."scorecard_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_revision_ratings" ADD CONSTRAINT "scorecard_revision_ratings_criterion_id_scorecard_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."scorecard_criteria"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_revisions" ADD CONSTRAINT "scorecard_revisions_scorecard_id_scorecards_id_fk" FOREIGN KEY ("scorecard_id") REFERENCES "public"."scorecards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_revisions" ADD CONSTRAINT "scorecard_revisions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scorecard_revision_ratings_unique" ON "scorecard_revision_ratings" USING btree ("revision_id","criterion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scorecard_revisions_number_unique" ON "scorecard_revisions" USING btree ("scorecard_id","revision_number");--> statement-breakpoint
-- Existing submitted scorecards become immutable revision 1 records. Use the
-- original submission time when present; updated_at is only a legacy fallback.
INSERT INTO "scorecard_revisions" (
	"scorecard_id",
	"revision_number",
	"author_id",
	"recommendation",
	"overall_score",
	"strengths",
	"concerns",
	"notes",
	"created_at"
)
SELECT
	"id",
	1,
	"author_id",
	"recommendation",
	"overall_score",
	"strengths",
	"concerns",
	"notes",
	COALESCE("submitted_at", "updated_at")
FROM "scorecards"
WHERE "status" = 'submitted';--> statement-breakpoint
INSERT INTO "scorecard_revision_ratings" (
	"revision_id",
	"criterion_id",
	"rating",
	"comment",
	"created_at"
)
SELECT
	revision."id",
	rating."criterion_id",
	rating."rating",
	rating."comment",
	revision."created_at"
FROM "scorecard_ratings" rating
INNER JOIN "scorecard_revisions" revision
	ON revision."scorecard_id" = rating."scorecard_id"
	AND revision."revision_number" = 1;
