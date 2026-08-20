CREATE TABLE canteen.customer_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id uuid NOT NULL REFERENCES canteen.store(id),
  customer_user_profile_id uuid NOT NULL REFERENCES core.user_profile(id),
  status text NOT NULL DEFAULT 'PLACED' CHECK (
    status IN (
      'PLACED',
      'ACCEPTED',
      'PREPARING',
      'READY',
      'DELIVERED',
      'CANCELLED',
      'REJECTED',
      'CANCELLED_BY_CANTEEN'
    )
  ),
  total_minor bigint NOT NULL CHECK (total_minor > 0),
  delivery_code text NOT NULL CHECK (delivery_code ~ '^[0-9]{6}$'),
  idempotency_key text NOT NULL UNIQUE
    CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE canteen.order_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES canteen.customer_order(id),
  product_id uuid NOT NULL REFERENCES canteen.product(id),
  product_name text NOT NULL CHECK (length(trim(product_name)) BETWEEN 1 AND 120),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor > 0),
  quantity bigint NOT NULL CHECK (quantity > 0),
  line_total_minor bigint NOT NULL CHECK (
    line_total_minor > 0
    AND line_total_minor = unit_price_minor * quantity
  ),
  UNIQUE (order_id, product_id)
);

CREATE TABLE canteen.order_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES canteen.customer_order(id),
  from_status text,
  to_status text NOT NULL,
  actor_user_profile_id uuid NOT NULL REFERENCES core.user_profile(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_order_customer_created_idx
  ON canteen.customer_order (customer_user_profile_id, created_at DESC, id DESC);

CREATE INDEX customer_order_canteen_status_created_idx
  ON canteen.customer_order (canteen_id, status, created_at, id);

CREATE INDEX order_item_order_idx
  ON canteen.order_item (order_id);

CREATE OR REPLACE FUNCTION canteen.reject_order_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'canteen order history entries are immutable';
END;
$$;

CREATE TRIGGER order_item_immutable
BEFORE UPDATE OR DELETE ON canteen.order_item
FOR EACH ROW EXECUTE FUNCTION canteen.reject_order_history_mutation();

CREATE TRIGGER order_event_immutable
BEFORE UPDATE OR DELETE ON canteen.order_event
FOR EACH ROW EXECUTE FUNCTION canteen.reject_order_history_mutation();

UPDATE canteen.store
SET ordering_enabled = true,
    updated_at = now()
WHERE customer_visible;
