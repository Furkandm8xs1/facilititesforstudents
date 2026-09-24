CREATE SCHEMA IF NOT EXISTS laundry;

INSERT INTO core.service_unit (code, name, kind)
VALUES ('laundry-main', 'Çamaşırhane', 'LAUNDRY')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    kind = EXCLUDED.kind,
    active = true;

CREATE TABLE laundry.tariff (
  service_unit_id uuid PRIMARY KEY REFERENCES core.service_unit(id),
  wash_price_minor bigint NOT NULL DEFAULT 1500
    CHECK (wash_price_minor > 0 AND wash_price_minor % 100 = 0),
  dry_price_minor bigint NOT NULL DEFAULT 1000
    CHECK (dry_price_minor > 0 AND dry_price_minor % 100 = 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_profile_id uuid REFERENCES core.user_profile(id)
);

INSERT INTO laundry.tariff (service_unit_id)
SELECT id FROM core.service_unit WHERE code = 'laundry-main'
ON CONFLICT (service_unit_id) DO NOTHING;

CREATE TABLE laundry.load (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_unit_id uuid NOT NULL REFERENCES core.service_unit(id),
  owner_user_profile_id uuid NOT NULL REFERENCES core.user_profile(id),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'COMPLETED', 'REFUNDED')),
  create_idempotency_key text NOT NULL UNIQUE
    CHECK (length(create_idempotency_key) BETWEEN 8 AND 120),
  created_by_user_profile_id uuid NOT NULL REFERENCES core.user_profile(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  refunded_at timestamptz,
  refund_reason text CHECK (
    refund_reason IS NULL OR length(trim(refund_reason)) BETWEEN 3 AND 500
  ),
  refund_idempotency_key text UNIQUE
    CHECK (
      refund_idempotency_key IS NULL
      OR length(refund_idempotency_key) BETWEEN 8 AND 120
    ),
  CHECK (
    (status = 'ACTIVE' AND completed_at IS NULL AND refunded_at IS NULL)
    OR (status = 'COMPLETED' AND completed_at IS NOT NULL AND refunded_at IS NULL)
    OR (
      status = 'REFUNDED'
      AND refunded_at IS NOT NULL
      AND refund_reason IS NOT NULL
      AND refund_idempotency_key IS NOT NULL
    )
  )
);

CREATE TABLE laundry.machine_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES laundry.load(id),
  machine_type text NOT NULL CHECK (machine_type IN ('WASH', 'DRY')),
  machine_number integer NOT NULL,
  status text NOT NULL DEFAULT 'IN_MACHINE'
    CHECK (status IN ('IN_MACHINE', 'REMOVED')),
  price_minor bigint NOT NULL
    CHECK (price_minor > 0 AND price_minor % 100 = 0),
  idempotency_key text NOT NULL UNIQUE
    CHECK (length(idempotency_key) BETWEEN 8 AND 120),
  started_by_user_profile_id uuid NOT NULL REFERENCES core.user_profile(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  removed_by_user_profile_id uuid REFERENCES core.user_profile(id),
  removed_at timestamptz,
  CHECK (
    (machine_type = 'WASH' AND machine_number BETWEEN 1 AND 7)
    OR (machine_type = 'DRY' AND machine_number BETWEEN 1 AND 8)
  ),
  CHECK (
    (status = 'IN_MACHINE' AND removed_at IS NULL AND removed_by_user_profile_id IS NULL)
    OR (status = 'REMOVED' AND removed_at IS NOT NULL AND removed_by_user_profile_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX laundry_active_machine_idx
  ON laundry.machine_run (machine_type, machine_number)
  WHERE status = 'IN_MACHINE';

CREATE UNIQUE INDEX laundry_active_load_run_idx
  ON laundry.machine_run (load_id)
  WHERE status = 'IN_MACHINE';

CREATE INDEX laundry_load_owner_created_idx
  ON laundry.load (owner_user_profile_id, created_at DESC, id DESC);

CREATE INDEX laundry_run_load_started_idx
  ON laundry.machine_run (load_id, started_at, id);

CREATE TABLE laundry.load_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES laundry.load(id),
  run_id uuid REFERENCES laundry.machine_run(id),
  event_type text NOT NULL CHECK (
    event_type IN (
      'LOAD_CREATED',
      'RUN_STARTED',
      'RUN_REMOVED',
      'LOAD_COMPLETED',
      'LOAD_REFUNDED'
    )
  ),
  actor_user_profile_id uuid NOT NULL REFERENCES core.user_profile(id),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX laundry_event_load_created_idx
  ON laundry.load_event (load_id, created_at, id);

CREATE OR REPLACE FUNCTION laundry.reject_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'laundry history is immutable';
END;
$$;

CREATE TRIGGER laundry_machine_run_immutable_history
BEFORE DELETE ON laundry.machine_run
FOR EACH ROW EXECUTE FUNCTION laundry.reject_history_mutation();

CREATE TRIGGER laundry_load_event_immutable
BEFORE UPDATE OR DELETE ON laundry.load_event
FOR EACH ROW EXECUTE FUNCTION laundry.reject_history_mutation();
