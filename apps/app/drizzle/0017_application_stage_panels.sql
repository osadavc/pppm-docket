-- Who reviews a candidate at a stage. A scheduled interview names its own
-- panel for that one candidate; otherwise the stage's standing panel applies.
-- Observers attend but are not asked for a scorecard.
CREATE VIEW "application_stage_panels" AS
SELECT s."id" AS "application_stage_id", s."application_id", s."position_stage_id", psi."user_id"
FROM "application_stages" s
JOIN "position_stage_interviewers" psi ON psi."position_stage_id" = s."position_stage_id"
WHERE NOT EXISTS (
  SELECT 1 FROM "interviews" i
  WHERE i."application_stage_id" = s."id" AND i."status" <> 'cancelled'
)
UNION
SELECT s."id", s."application_id", s."position_stage_id", p."user_id"
FROM "application_stages" s
JOIN "interviews" i ON i."application_stage_id" = s."id" AND i."status" <> 'cancelled'
JOIN "interview_participants" p ON p."interview_id" = i."id" AND p."role" <> 'observer';
