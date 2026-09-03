CREATE SCHEMA IF NOT EXISTS tea_cafe;

ALTER TABLE core.service_unit
  DROP CONSTRAINT IF EXISTS service_unit_kind_check;

ALTER TABLE core.service_unit
  ADD CONSTRAINT service_unit_kind_check
  CHECK (kind IN ('CANTEEN', 'LAUNDRY', 'KITCHEN', 'TEA_CAFE'));

INSERT INTO core.service_unit (code, name, kind)
VALUES ('tea-cafe-main', 'Tea & Cafe', 'TEA_CAFE')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    kind = EXCLUDED.kind,
    active = true;

CREATE TABLE tea_cafe.brew (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_unit_id uuid NOT NULL REFERENCES core.service_unit(id),
  beverage_type text NOT NULL CHECK (beverage_type IN ('TEA', 'COFFEE')),
  note text CHECK (note IS NULL OR length(trim(note)) BETWEEN 1 AND 80),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 180),
  started_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz NOT NULL,
  created_by_user_profile_id uuid NOT NULL REFERENCES core.user_profile(id),
  deleted_at timestamptz,
  deleted_by_user_profile_id uuid REFERENCES core.user_profile(id),
  CHECK (beverage_type <> 'TEA' OR duration_minutes = 21),
  CHECK (ready_at > started_at),
  CHECK (
    (deleted_at IS NULL AND deleted_by_user_profile_id IS NULL)
    OR (deleted_at IS NOT NULL AND deleted_by_user_profile_id IS NOT NULL)
  )
);

CREATE INDEX tea_cafe_brew_visible_ready_idx
  ON tea_cafe.brew (service_unit_id, ready_at, id)
  WHERE deleted_at IS NULL;
