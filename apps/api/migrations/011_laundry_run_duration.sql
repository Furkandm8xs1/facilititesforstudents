ALTER TABLE laundry.machine_run
  DISABLE TRIGGER laundry_machine_run_guard_update;

ALTER TABLE laundry.machine_run
  DROP CONSTRAINT laundry_machine_run_duration_check;

UPDATE laundry.machine_run
SET duration_seconds = 9000,
    ready_at = started_at + interval '2 hours 30 minutes';

ALTER TABLE laundry.machine_run
  ALTER COLUMN duration_seconds SET DEFAULT 9000,
  ADD CONSTRAINT laundry_machine_run_duration_check
    CHECK (duration_seconds = 9000);

ALTER TABLE laundry.machine_run
  ENABLE TRIGGER laundry_machine_run_guard_update;
