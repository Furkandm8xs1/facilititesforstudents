CREATE TABLE wallet.account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id uuid NOT NULL UNIQUE REFERENCES core.user_profile(id),
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency = 'TRY'),
  available_minor bigint NOT NULL DEFAULT 0 CHECK (available_minor >= 0),
  held_minor bigint NOT NULL DEFAULT 0 CHECK (held_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wallet.ledger_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES wallet.account(id),
  entry_type text NOT NULL CHECK (
    entry_type IN (
      'CASH_DEPOSIT',
      'CASH_DEPOSIT_REVERSAL',
      'HOLD',
      'CAPTURE',
      'RELEASE',
      'SERVICE_REFUND'
    )
  ),
  available_delta_minor bigint NOT NULL,
  held_delta_minor bigint NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL UNIQUE
    CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  actor_user_profile_id uuid REFERENCES core.user_profile(id),
  service_code text,
  reference_id uuid,
  reversal_of_entry_id uuid UNIQUE REFERENCES wallet.ledger_entry(id),
  reason text CHECK (reason IS NULL OR length(trim(reason)) BETWEEN 3 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (entry_type = 'CASH_DEPOSIT'
      AND available_delta_minor > 0
      AND held_delta_minor = 0
      AND reversal_of_entry_id IS NULL)
    OR
    (entry_type = 'CASH_DEPOSIT_REVERSAL'
      AND available_delta_minor < 0
      AND held_delta_minor = 0
      AND reversal_of_entry_id IS NOT NULL
      AND reason IS NOT NULL)
    OR
    (entry_type = 'HOLD'
      AND available_delta_minor < 0
      AND held_delta_minor > 0
      AND available_delta_minor + held_delta_minor = 0)
    OR
    (entry_type = 'CAPTURE'
      AND available_delta_minor = 0
      AND held_delta_minor < 0)
    OR
    (entry_type = 'RELEASE'
      AND available_delta_minor > 0
      AND held_delta_minor < 0
      AND available_delta_minor + held_delta_minor = 0)
    OR
    (entry_type = 'SERVICE_REFUND'
      AND available_delta_minor > 0
      AND held_delta_minor = 0)
  )
);

CREATE INDEX ledger_entry_account_created_idx
  ON wallet.ledger_entry (account_id, created_at DESC, id DESC);

CREATE INDEX ledger_entry_actor_created_idx
  ON wallet.ledger_entry (actor_user_profile_id, created_at DESC)
  WHERE actor_user_profile_id IS NOT NULL;

CREATE OR REPLACE FUNCTION wallet.reject_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'wallet ledger entries are immutable';
END;
$$;

CREATE TRIGGER ledger_entry_immutable
BEFORE UPDATE OR DELETE ON wallet.ledger_entry
FOR EACH ROW EXECUTE FUNCTION wallet.reject_ledger_mutation();

CREATE OR REPLACE FUNCTION wallet.create_account_for_user()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO wallet.account (user_profile_id)
  VALUES (NEW.id)
  ON CONFLICT (user_profile_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_wallet_account_after_user
AFTER INSERT ON core.user_profile
FOR EACH ROW EXECUTE FUNCTION wallet.create_account_for_user();

INSERT INTO wallet.account (user_profile_id)
SELECT id
FROM core.user_profile
ON CONFLICT (user_profile_id) DO NOTHING;
