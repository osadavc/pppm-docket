ALTER TYPE "public"."position_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "closure_note" text;--> statement-breakpoint
-- A position that is not open must reject new applications.
--
-- Enforced in the database rather than only in the action layer: the rule is
-- about data integrity, and a trigger cannot be forgotten by a future code
-- path the way a service-layer check can. Existing applications are untouched,
-- so a role can still be filled or closed while candidates are mid-pipeline.
CREATE OR REPLACE FUNCTION reject_applications_to_unopen_position()
RETURNS trigger AS $$
DECLARE
  current_status text;
BEGIN
  SELECT status::text INTO current_status FROM positions WHERE id = NEW.position_id;

  IF current_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION
      'Position % is % and is not accepting applications', NEW.position_id, current_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER applications_position_must_be_open
BEFORE INSERT ON applications
FOR EACH ROW EXECUTE FUNCTION reject_applications_to_unopen_position();
