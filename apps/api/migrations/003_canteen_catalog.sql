CREATE TABLE canteen.store (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_unit_id uuid NOT NULL UNIQUE REFERENCES core.service_unit(id),
  customer_visible boolean NOT NULL DEFAULT false,
  ordering_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO canteen.store (service_unit_id, customer_visible)
SELECT id, code = 'canteen-main'
FROM core.service_unit
WHERE kind = 'CANTEEN'
ON CONFLICT (service_unit_id) DO UPDATE
SET customer_visible = EXCLUDED.customer_visible;

CREATE UNIQUE INDEX canteen_single_customer_visible_idx
  ON canteen.store (customer_visible)
  WHERE customer_visible;

CREATE TABLE canteen.product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id uuid NOT NULL REFERENCES canteen.store(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  name_key text NOT NULL CHECK (length(trim(name_key)) BETWEEN 1 AND 120),
  price_minor bigint NOT NULL CHECK (
    price_minor > 0 AND price_minor % 100 = 0
  ),
  stock_on_hand bigint NOT NULL DEFAULT 0 CHECK (stock_on_hand >= 0),
  stock_reserved bigint NOT NULL DEFAULT 0 CHECK (
    stock_reserved >= 0 AND stock_reserved <= stock_on_hand
  ),
  listed boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canteen_id, name_key)
);

CREATE INDEX canteen_product_customer_catalog_idx
  ON canteen.product (canteen_id, name)
  WHERE archived_at IS NULL AND listed;

CREATE TABLE canteen.product_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES canteen.product(id),
  event_type text NOT NULL CHECK (
    event_type IN (
      'CREATED',
      'UPDATED',
      'STOCK_SET',
      'LISTED',
      'UNLISTED',
      'ARCHIVED',
      'REACTIVATED'
    )
  ),
  actor_user_profile_id uuid NOT NULL REFERENCES core.user_profile(id),
  before_state jsonb,
  after_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX canteen_product_event_product_created_idx
  ON canteen.product_event (product_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION canteen.reject_product_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'canteen product events are immutable';
END;
$$;

CREATE TRIGGER product_event_immutable
BEFORE UPDATE OR DELETE ON canteen.product_event
FOR EACH ROW EXECUTE FUNCTION canteen.reject_product_event_mutation();
