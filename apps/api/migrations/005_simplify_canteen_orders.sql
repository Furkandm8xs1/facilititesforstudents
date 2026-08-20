INSERT INTO wallet.ledger_entry (
  account_id,
  entry_type,
  available_delta_minor,
  held_delta_minor,
  idempotency_key,
  actor_user_profile_id,
  service_code,
  reference_id
)
SELECT
  account.id,
  'CAPTURE',
  0,
  -orders.total_minor,
  'canteen-order-auto-capture:' || orders.id,
  orders.customer_user_profile_id,
  'canteen-main',
  orders.id
FROM canteen.customer_order AS orders
JOIN wallet.account AS account
  ON account.user_profile_id = orders.customer_user_profile_id
WHERE orders.status = 'PLACED';

WITH captured AS (
  SELECT customer_user_profile_id, sum(total_minor) AS total_minor
  FROM canteen.customer_order
  WHERE status = 'PLACED'
  GROUP BY customer_user_profile_id
)
UPDATE wallet.account AS account
SET held_minor = account.held_minor - captured.total_minor,
    updated_at = now()
FROM captured
WHERE account.user_profile_id = captured.customer_user_profile_id;

WITH finalized AS (
  SELECT item.product_id, sum(item.quantity) AS quantity
  FROM canteen.order_item AS item
  JOIN canteen.customer_order AS orders ON orders.id = item.order_id
  WHERE orders.status = 'PLACED'
  GROUP BY item.product_id
)
UPDATE canteen.product AS product
SET stock_on_hand = product.stock_on_hand - finalized.quantity,
    stock_reserved = product.stock_reserved - finalized.quantity,
    updated_at = now()
FROM finalized
WHERE product.id = finalized.product_id;

UPDATE canteen.customer_order
SET status = 'PLACED',
    updated_at = now()
WHERE status = 'ACCEPTED';

UPDATE canteen.customer_order
SET status = 'CANCELLED_BY_CANTEEN',
    updated_at = now()
WHERE status = 'REJECTED';

ALTER TABLE canteen.customer_order
  DROP CONSTRAINT customer_order_status_check,
  DROP COLUMN delivery_code;

ALTER TABLE canteen.customer_order
  ADD CONSTRAINT customer_order_status_check CHECK (
    status IN (
      'PLACED',
      'PREPARING',
      'READY',
      'DELIVERED',
      'CANCELLED',
      'CANCELLED_BY_CANTEEN'
    )
  );
