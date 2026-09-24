ALTER TABLE laundry.machine_run
  ADD COLUMN duration_seconds integer,
  ADD COLUMN ready_at timestamptz;

ALTER TABLE laundry.machine_run
  DISABLE TRIGGER laundry_machine_run_guard_update;

UPDATE laundry.machine_run
SET duration_seconds = 150,
    ready_at = started_at + interval '150 seconds';

ALTER TABLE laundry.machine_run
  ENABLE TRIGGER laundry_machine_run_guard_update;

ALTER TABLE laundry.machine_run
  ALTER COLUMN duration_seconds SET DEFAULT 150,
  ALTER COLUMN duration_seconds SET NOT NULL,
  ALTER COLUMN ready_at SET NOT NULL,
  ADD CONSTRAINT laundry_machine_run_duration_check
    CHECK (duration_seconds > 0),
  ADD CONSTRAINT laundry_machine_run_ready_at_check
    CHECK (
      ready_at = started_at + make_interval(secs => duration_seconds)
    );

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
    AND NEW.duration_seconds = OLD.duration_seconds
    AND NEW.ready_at = OLD.ready_at
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
