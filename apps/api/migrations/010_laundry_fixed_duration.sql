ALTER TABLE laundry.machine_run
  DROP CONSTRAINT laundry_machine_run_duration_check,
  ADD CONSTRAINT laundry_machine_run_duration_check
    CHECK (duration_seconds = 150);
