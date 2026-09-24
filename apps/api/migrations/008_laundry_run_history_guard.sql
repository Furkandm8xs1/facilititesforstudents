CREATE OR REPLACE FUNCTION laundry.guard_machine_run_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'IN_MACHINE'
    AND NEW.status = 'REMOVED'
    AND NEW.id = OLD.id
    AND NEW.load_id = OLD.load_id
    AND NEW.machine_type = OLD.machine_type
    AND NEW.machine_number = OLD.machine_number
    AND NEW.price_minor = OLD.price_minor
    AND NEW.idempotency_key = OLD.idempotency_key
    AND NEW.started_by_user_profile_id = OLD.started_by_user_profile_id
    AND NEW.started_at = OLD.started_at
    AND OLD.removed_by_user_profile_id IS NULL
    AND OLD.removed_at IS NULL
    AND NEW.removed_by_user_profile_id IS NOT NULL
    AND NEW.removed_at IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'laundry machine run history is immutable';
END;
$$;

CREATE TRIGGER laundry_machine_run_guard_update
BEFORE UPDATE ON laundry.machine_run
FOR EACH ROW EXECUTE FUNCTION laundry.guard_machine_run_update();
