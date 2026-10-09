# `canteen` Schema — Store, Catalog and Orders

Created by
[`003_canteen_catalog.sql`](../../apps/api/migrations/003_canteen_catalog.sql)
and [`004_canteen_orders.sql`](../../apps/api/migrations/004_canteen_orders.sql);
the order workflow was simplified by
[`005_simplify_canteen_orders.sql`](../../apps/api/migrations/005_simplify_canteen_orders.sql).

The tables form two groups that meet at `canteen.product`:

- **Catalog:** `store`, `product`, `product_event`
- **Orders:** `customer_order`, `order_item`, `order_event`

## At a glance

| Table                    | Group   | Role                              | Mutability            |
| ------------------------ | ------- | --------------------------------- | --------------------- |
| `canteen.store`          | Catalog | **Entity** – canteen settings     | mutable (flags)       |
| `canteen.product`        | Catalog | **Entity** – a sellable item      | mutable, soft-deleted |
| `canteen.product_event`  | Catalog | **Event** – catalog audit trail   | immutable             |
| `canteen.customer_order` | Orders  | **Entity** – an order header      | only `status` changes |
| `canteen.order_item`     | Orders  | **Association** – order ↔ product | immutable snapshot    |
| `canteen.order_event`    | Orders  | **Event** – status history        | immutable             |

**Design principles**

- **Snapshots, not joins, for history.** `order_item` copies the product name
  and price at order time, so later price edits never rewrite past orders.
- **Stock is reserved vs. on hand.** `stock_reserved <= stock_on_hand` prevents
  overselling.
- **Orders are paid immediately.** Placing an order writes a wallet
  `HOLD` + `CAPTURE` in the same transaction.

## Entity–relationship diagram

Notation: `PK` primary key, `FK` foreign key, `UK` unique key. Dotted
relationships are logical (no database foreign key).

```mermaid
erDiagram
    SERVICE_UNIT ||--o| STORE : "configured by (1:1)"
    STORE ||--o{ PRODUCT : "sells"
    PRODUCT ||--o{ PRODUCT_EVENT : "audited by"
    USER_PROFILE ||--o{ PRODUCT_EVENT : "performs"

    STORE ||--o{ CUSTOMER_ORDER : "receives"
    USER_PROFILE ||--o{ CUSTOMER_ORDER : "places"
    CUSTOMER_ORDER ||--|{ ORDER_ITEM : "contains"
    PRODUCT ||--o{ ORDER_ITEM : "is ordered as"
    CUSTOMER_ORDER ||--|{ ORDER_EVENT : "tracked by"
    USER_PROFILE ||--o{ ORDER_EVENT : "performs"

    CUSTOMER_ORDER ||..o{ LEDGER_ENTRY : "reference_id (logical)"

    STORE {
        uuid id PK
        uuid service_unit_id UK, FK
        boolean customer_visible "at most one true"
        boolean ordering_enabled
        timestamptz created_at
        timestamptz updated_at
    }

    PRODUCT {
        uuid id PK
        uuid canteen_id FK
        text name
        text name_key UK "unique per store"
        bigint price_minor "whole lira"
        bigint stock_on_hand
        bigint stock_reserved
        boolean listed
        timestamptz archived_at "soft delete"
    }

    PRODUCT_EVENT {
        uuid id PK
        uuid product_id FK
        text event_type
        uuid actor_user_profile_id FK
        jsonb before_state
        jsonb after_state
        timestamptz created_at
    }

    CUSTOMER_ORDER {
        uuid id PK
        uuid canteen_id FK
        uuid customer_user_profile_id FK
        text status
        bigint total_minor
        text idempotency_key UK
        timestamptz created_at
        timestamptz updated_at
    }

    ORDER_ITEM {
        uuid id PK
        uuid order_id FK, UK
        uuid product_id FK, UK
        text product_name "snapshot"
        bigint unit_price_minor "snapshot"
        bigint quantity
        bigint line_total_minor
    }

    ORDER_EVENT {
        uuid id PK
        uuid order_id FK
        text from_status "null on creation"
        text to_status
        uuid actor_user_profile_id FK
        timestamptz created_at
    }
```

### Reading the diagram

| Relationship                     | Cardinality | Meaning                                                               |
| -------------------------------- | ----------- | --------------------------------------------------------------------- |
| `service_unit` → `store`         | 1 : 0..1    | Each canteen unit has at most one store configuration row.            |
| `store` → `product`              | 1 : N       | A store owns its catalog.                                             |
| `product` → `product_event`      | 1 : N       | Every catalog change leaves an audit row.                             |
| `store` → `customer_order`       | 1 : N       | Orders belong to one store.                                           |
| `customer_order` → `order_item`  | 1 : 1..N    | An order has at least one line; `(order_id, product_id)` is unique.   |
| `product` → `order_item`         | 1 : N       | A product can appear in many orders; the line keeps a price snapshot. |
| `customer_order` → `order_event` | 1 : 1..N    | At least the creation event exists for every order.                   |

| Child column (holds the reference)                | Referenced column           | Cardinality / note            | Type            |
| ------------------------------------------------- | --------------------------- | ----------------------------- | --------------- |
| `canteen.store.service_unit_id`                   | `core.service_unit.id`      | 1 : 1                         | Foreign key     |
| `canteen.product.canteen_id`                      | `canteen.store.id`          | N : 1                         | Foreign key     |
| `canteen.product_event.product_id`                | `canteen.product.id`        | N : 1                         | Foreign key     |
| `canteen.product_event.actor_user_profile_id`     | `core.user_profile.id`      | N : 1                         | Foreign key     |
| `canteen.customer_order.canteen_id`               | `canteen.store.id`          | N : 1                         | Foreign key     |
| `canteen.customer_order.customer_user_profile_id` | `core.user_profile.id`      | N : 1                         | Foreign key     |
| `canteen.order_item.order_id`                     | `canteen.customer_order.id` | N : 1                         | Foreign key     |
| `canteen.order_item.product_id`                   | `canteen.product.id`        | N : 1                         | Foreign key     |
| `canteen.order_event.order_id`                    | `canteen.customer_order.id` | N : 1                         | Foreign key     |
| `canteen.order_event.actor_user_profile_id`       | `core.user_profile.id`      | N : 1                         | Foreign key     |
| `wallet.ledger_entry.reference_id`                | `canteen.customer_order.id` | service_code = 'canteen-main' | Logical (no FK) |

### Order status lifecycle

```mermaid
stateDiagram-v2
    [*] --> PLACED : customer pays (HOLD + CAPTURE)
    PLACED --> PREPARING
    PREPARING --> READY
    READY --> DELIVERED
    PLACED --> CANCELLED : customer cancels (SERVICE_REFUND)
    PLACED --> CANCELLED_BY_CANTEEN : canteen cancels (SERVICE_REFUND)
    PREPARING --> CANCELLED_BY_CANTEEN
    DELIVERED --> [*]
    CANCELLED --> [*]
    CANCELLED_BY_CANTEEN --> [*]
```

> [!NOTE]
> The database restricts `status` to the six values; which transitions are legal
> is decided by the API. Every transition appends a row to `order_event`.

### Placing an order

```mermaid
sequenceDiagram
    autonumber
    participant C as Customer
    participant API as API
    participant P as canteen.product
    participant O as canteen.customer_order
    participant W as wallet.ledger_entry

    C->>API: POST order (idempotency key)
    API->>P: check and reserve stock
    API->>O: INSERT order (PLACED) + order_item snapshots
    API->>W: INSERT HOLD then CAPTURE (reference_id = order.id)
    API->>O: INSERT order_event (NULL → PLACED)
    API-->>C: 201 Created
```

---

## Catalog group

### `canteen.store`

Canteen-specific settings for a `CANTEEN` service unit.

| Column             | Type          | Null | Default             | Constraints / notes                              |
| ------------------ | ------------- | ---- | ------------------- | ------------------------------------------------ |
| `id`               | `uuid`        | no   | `gen_random_uuid()` | **PK**                                           |
| `service_unit_id`  | `uuid`        | no   |                     | `UNIQUE`, **FK** → `core.service_unit.id`        |
| `customer_visible` | `boolean`     | no   | `false`             | at most one store may be `true` (partial unique) |
| `ordering_enabled` | `boolean`     | no   | `false`             | customers can place orders when `true`           |
| `created_at`       | `timestamptz` | no   | `now()`             |                                                  |
| `updated_at`       | `timestamptz` | no   | `now()`             |                                                  |

| Index                                 | Columns              | Notes                                       |
| ------------------------------------- | -------------------- | ------------------------------------------- |
| `canteen_single_customer_visible_idx` | `(customer_visible)` | `UNIQUE`, partial: `WHERE customer_visible` |

A store row is seeded for every `CANTEEN` service unit; `canteen-main` is the
customer-visible one.

### `canteen.product`

| Column           | Type          | Null | Default             | Constraints / notes                                                |
| ---------------- | ------------- | ---- | ------------------- | ------------------------------------------------------------------ |
| `id`             | `uuid`        | no   | `gen_random_uuid()` | **PK**                                                             |
| `canteen_id`     | `uuid`        | no   |                     | **FK** → `canteen.store.id`                                        |
| `name`           | `text`        | no   |                     | 1–120 characters after trim                                        |
| `name_key`       | `text`        | no   |                     | normalised name, 1–120 characters; `UNIQUE (canteen_id, name_key)` |
| `price_minor`    | `bigint`      | no   |                     | `> 0` and whole lira (`% 100 = 0`)                                 |
| `stock_on_hand`  | `bigint`      | no   | `0`                 | `>= 0`                                                             |
| `stock_reserved` | `bigint`      | no   | `0`                 | `>= 0` and `<= stock_on_hand`                                      |
| `listed`         | `boolean`     | no   | `true`              | shown in the customer catalog                                      |
| `archived_at`    | `timestamptz` | yes  |                     | soft delete                                                        |
| `created_at`     | `timestamptz` | no   | `now()`             |                                                                    |
| `updated_at`     | `timestamptz` | no   | `now()`             |                                                                    |

| Index                                  | Columns                  | Notes                                     |
| -------------------------------------- | ------------------------ | ----------------------------------------- |
| `UNIQUE (canteen_id, name_key)`        | `(canteen_id, name_key)` | no duplicate product names per store      |
| `canteen_product_customer_catalog_idx` | `(canteen_id, name)`     | partial: `archived_at IS NULL AND listed` |

### `canteen.product_event`

Immutable audit trail of catalog changes.

| Column                  | Type          | Null | Default             | Constraints / notes                                                                |
| ----------------------- | ------------- | ---- | ------------------- | ---------------------------------------------------------------------------------- |
| `id`                    | `uuid`        | no   | `gen_random_uuid()` | **PK**                                                                             |
| `product_id`            | `uuid`        | no   |                     | **FK** → `canteen.product.id`                                                      |
| `event_type`            | `text`        | no   |                     | `CREATED`, `UPDATED`, `STOCK_SET`, `LISTED`, `UNLISTED`, `ARCHIVED`, `REACTIVATED` |
| `actor_user_profile_id` | `uuid`        | no   |                     | **FK** → `core.user_profile.id`                                                    |
| `before_state`          | `jsonb`       | yes  |                     | product snapshot before the change (`NULL` for `CREATED`)                          |
| `after_state`           | `jsonb`       | no   |                     | product snapshot after the change                                                  |
| `created_at`            | `timestamptz` | no   | `now()`             |                                                                                    |

| Index / trigger                             | Definition                                  |
| ------------------------------------------- | ------------------------------------------- |
| `canteen_product_event_product_created_idx` | `(product_id, created_at DESC, id DESC)`    |
| `product_event_immutable` (trigger)         | `BEFORE UPDATE OR DELETE` → raises an error |

---

## Orders group

### `canteen.customer_order`

| Column                     | Type          | Null | Default             | Constraints / notes                                                              |
| -------------------------- | ------------- | ---- | ------------------- | -------------------------------------------------------------------------------- |
| `id`                       | `uuid`        | no   | `gen_random_uuid()` | **PK**                                                                           |
| `canteen_id`               | `uuid`        | no   |                     | **FK** → `canteen.store.id`                                                      |
| `customer_user_profile_id` | `uuid`        | no   |                     | **FK** → `core.user_profile.id`                                                  |
| `status`                   | `text`        | no   | `'PLACED'`          | `PLACED`, `PREPARING`, `READY`, `DELIVERED`, `CANCELLED`, `CANCELLED_BY_CANTEEN` |
| `total_minor`              | `bigint`      | no   |                     | `> 0`; sum of the order's `line_total_minor`                                     |
| `idempotency_key`          | `text`        | no   |                     | `UNIQUE`; 8–200 characters                                                       |
| `created_at`               | `timestamptz` | no   | `now()`             |                                                                                  |
| `updated_at`               | `timestamptz` | no   | `now()`             |                                                                                  |

> [!NOTE]
> Migration `004` originally also had `ACCEPTED` / `REJECTED` statuses and a
> six-digit `delivery_code`. Migration `005` removed them: orders are now
> captured from the wallet immediately when placed.

| Index                                       | Columns                                                |
| ------------------------------------------- | ------------------------------------------------------ |
| `customer_order_customer_created_idx`       | `(customer_user_profile_id, created_at DESC, id DESC)` |
| `customer_order_canteen_status_created_idx` | `(canteen_id, status, created_at, id)`                 |

Wallet link: placing an order writes a `HOLD` + `CAPTURE` pair, and a refund
writes a `SERVICE_REFUND`, all with `service_code = 'canteen-main'` and
`reference_id = customer_order.id`.

### `canteen.order_item`

Immutable line items with name and price snapshots taken at order time.

| Column             | Type     | Null | Default             | Constraints / notes                       |
| ------------------ | -------- | ---- | ------------------- | ----------------------------------------- |
| `id`               | `uuid`   | no   | `gen_random_uuid()` | **PK**                                    |
| `order_id`         | `uuid`   | no   |                     | **FK** → `canteen.customer_order.id`      |
| `product_id`       | `uuid`   | no   |                     | **FK** → `canteen.product.id`             |
| `product_name`     | `text`   | no   |                     | snapshot; 1–120 characters                |
| `unit_price_minor` | `bigint` | no   |                     | snapshot; `> 0`                           |
| `quantity`         | `bigint` | no   |                     | `> 0`                                     |
| `line_total_minor` | `bigint` | no   |                     | `> 0` and `= unit_price_minor * quantity` |

| Index / constraint / trigger     | Definition                                  |
| -------------------------------- | ------------------------------------------- |
| `UNIQUE (order_id, product_id)`  | a product appears once per order            |
| `order_item_order_idx`           | `(order_id)`                                |
| `order_item_immutable` (trigger) | `BEFORE UPDATE OR DELETE` → raises an error |

### `canteen.order_event`

Immutable status-transition history of an order.

| Column                  | Type          | Null | Default             | Constraints / notes                  |
| ----------------------- | ------------- | ---- | ------------------- | ------------------------------------ |
| `id`                    | `uuid`        | no   | `gen_random_uuid()` | **PK**                               |
| `order_id`              | `uuid`        | no   |                     | **FK** → `canteen.customer_order.id` |
| `from_status`           | `text`        | yes  |                     | `NULL` for the creation event        |
| `to_status`             | `text`        | no   |                     |                                      |
| `actor_user_profile_id` | `uuid`        | no   |                     | **FK** → `core.user_profile.id`      |
| `created_at`            | `timestamptz` | no   | `now()`             |                                      |

| Trigger                 | Definition                                  |
| ----------------------- | ------------------------------------------- |
| `order_event_immutable` | `BEFORE UPDATE OR DELETE` → raises an error |
