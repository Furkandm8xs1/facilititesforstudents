# Canteen Module

The canteen module owns the customer catalog, product administration, stock,
ordering availability, customer orders, status transitions, and service
refunds. Only the customer-visible `canteen-main` store is exposed to users.

## Public-to-authenticated customer endpoints

All routes still require authentication.

| Method | Path                                     | Purpose                            |
| ------ | ---------------------------------------- | ---------------------------------- |
| `GET`  | `/api/v1/canteen/catalog`                | List visible in-stock products     |
| `GET`  | `/api/v1/canteen/orders`                 | List the caller's orders           |
| `POST` | `/api/v1/canteen/orders`                 | Place an order                     |
| `POST` | `/api/v1/canteen/orders/:orderId/cancel` | Cancel the caller's `PLACED` order |

## Management endpoints

The class requires either `canteen_manager` or `canteen_operator`. Product
creation and name/price changes additionally require `canteen_manager`.

| Method  | Path                                                    | Purpose                                                   |
| ------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `GET`   | `/api/v1/canteen/manage`                                | Full catalog including hidden and archived products       |
| `GET`   | `/api/v1/canteen/manage/orders`                         | Order queue and history                                   |
| `PATCH` | `/api/v1/canteen/manage/ordering`                       | Open or close ordering                                    |
| `PATCH` | `/api/v1/canteen/manage/orders/:orderId/status`         | Move an order to its next valid state or cancel/refund it |
| `POST`  | `/api/v1/canteen/manage/products`                       | Create, update, or reactivate a same-name product         |
| `PATCH` | `/api/v1/canteen/manage/products/:productId/details`    | Change product name and price                             |
| `PATCH` | `/api/v1/canteen/manage/products/:productId/stock`      | Set total stock                                           |
| `PATCH` | `/api/v1/canteen/manage/products/:productId/visibility` | List or unlist a product                                  |
| `POST`  | `/api/v1/canteen/manage/products/:productId/archive`    | Archive a product                                         |

## Product rules

- Product names are trimmed, whitespace-normalized, and compared with a
  Turkish lowercase `name_key`.
- A same-name create request updates/reactivates the existing row instead of
  creating a duplicate.
- Prices are positive whole TL in the form and `BIGINT` minor units in storage.
- Stock is a non-negative whole quantity.
- Archived or unlisted products are absent from the customer catalog.
- A product with no available stock is automatically absent from the customer
  catalog.
- Product events store immutable before/after JSON snapshots for audit.

## Order placement transaction

[`canteen-order.repository.ts`](./canteen-order.repository.ts) performs these
steps in one transaction:

1. Lock the authenticated customer's wallet account.
2. Return an earlier order when the idempotency key already belongs to that
   customer.
3. Lock the customer-visible store and require ordering to be enabled.
4. Sort and lock every requested product row.
5. Recheck listing, archive state, available stock, quantity limits, and price.
6. Calculate totals with `bigint` and require sufficient available balance.
7. Insert the order and immutable order-item name/price snapshots.
8. Decrease `stock_on_hand` immediately.
9. Insert matching `HOLD` and `CAPTURE` ledger entries in the same transaction;
   the final account has no remaining hold.
10. Decrease `available_minor` by the order total.
11. Insert the initial immutable order event.

Because order items contain `product_name`, `unit_price_minor`, and
`line_total_minor`, later product price changes cannot change historical order
totals or earnings.

## Order states

```text
PLACED -> PREPARING -> READY -> DELIVERED
   |          |
   |          +-> CANCELLED_BY_CANTEEN
   +-> CANCELLED
   +-> CANCELLED_BY_CANTEEN
```

- No separate staff acceptance step exists.
- No delivery code exists.
- The customer may cancel only while the order is `PLACED`.
- Staff may cancel and refund while `PLACED` or `PREPARING`.
- Cancellation inserts `SERVICE_REFUND`, restores available balance, and
  restores each item's stock in the same transaction.

## File guide

| File                                                                     | Responsibility                                              |
| ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| [`canteen.controller.ts`](./canteen.controller.ts)                       | Customer routes                                             |
| [`canteen-management.controller.ts`](./canteen-management.controller.ts) | Staff routes and role boundaries                            |
| [`canteen.input.ts`](./canteen.input.ts)                                 | Product and stock validation                                |
| [`canteen-order.input.ts`](./canteen-order.input.ts)                     | Order, quantity, idempotency, and state validation          |
| [`canteen.service.ts`](./canteen.service.ts)                             | Use-case coordination and HTTP errors                       |
| [`canteen.repository.ts`](./canteen.repository.ts)                       | Store/product SQL and product audit events                  |
| [`canteen-order.repository.ts`](./canteen-order.repository.ts)           | Order, wallet, stock, refund, and locking transaction logic |
| [`canteen.errors.ts`](./canteen.errors.ts)                               | Expected catalog/order rule failures                        |
