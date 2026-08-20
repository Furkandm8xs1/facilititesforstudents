CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS wallet;
CREATE SCHEMA IF NOT EXISTS canteen;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS core.user_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keycloak_subject uuid NOT NULL UNIQUE,
  phone_e164 text NOT NULL UNIQUE CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  first_name text NOT NULL CHECK (length(trim(first_name)) > 0),
  last_name text NOT NULL CHECK (length(trim(last_name)) > 0),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DEPARTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.service_unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('CANTEEN', 'LAUNDRY', 'KITCHEN')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.user_service_assignment (
  user_profile_id uuid NOT NULL REFERENCES core.user_profile(id),
  service_unit_id uuid NOT NULL REFERENCES core.service_unit(id),
  role_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_profile_id, service_unit_id, role_code)
);

INSERT INTO core.service_unit (code, name, kind)
VALUES ('canteen-main', 'Ana Kantin', 'CANTEEN')
ON CONFLICT (code) DO NOTHING;
