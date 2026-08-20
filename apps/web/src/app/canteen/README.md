# Canteen UI

The canteen feature has a customer page and a role-protected management page.

## Customer route: `/canteen`

[`page.tsx`](./page.tsx) loads the catalog, the caller's orders, and the caller's
wallet in parallel.

Render sequence:

1. Require an authenticated session and access token.
2. Determine whether the user should see the management link.
3. Show whether ordering is currently open.
4. Show available balance and customer-visible products.
5. Render one [`order-product-form.tsx`](./order-product-form.tsx) per product.
6. Render each historical/active order with
   [`order-history.tsx`](./order-history.tsx).

### Ordering

The product form submits product ID, whole quantity, and a browser-generated
idempotency UUID to [`actions.ts`](./actions.ts). The server action rechecks the
session and calls `placeCanteenOrder`.

The API immediately deducts balance and stock. There is no separate acceptance
step and no delivery code.

### Customer cancellation

`OrderHistory` displays a cancel button only for `PLACED`. The server action
calls the customer cancellation endpoint. A successful cancellation restores
balance and stock, then revalidates portal, wallet, customer canteen, and
management pages.

## Management route: `/canteen/manage`

The page requires `canteen_manager` or `canteen_operator` and loads the full
catalog plus the order queue.

Components:

| Component                                                            | Purpose                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`manage/ordering-control.tsx`](./manage/ordering-control.tsx)       | Open or close new ordering                                              |
| [`manage/order-queue.tsx`](./manage/order-queue.tsx)                 | Move orders through `PREPARING`, `READY`, `DELIVERED`, or cancel/refund |
| [`manage/create-product-form.tsx`](./manage/create-product-form.tsx) | Create/update/reactivate products; manager only                         |
| [`manage/product-editor.tsx`](./manage/product-editor.tsx)           | Edit details, stock, visibility, and archive state                      |
| [`manage/actions.ts`](./manage/actions.ts)                           | Authorize and dispatch every management intent                          |

## Role differences

- `canteen_manager` can create/reactivate products and edit name/price.
- `canteen_manager` and `canteen_operator` can change stock, visibility,
  ordering availability, order status, and archive products.
- The API repeats and enforces these role distinctions.

## Order UI states

```text
PLACED -> PREPARING -> READY -> DELIVERED
   |          |
   +----------+-> staff cancellation and automatic refund
```

The customer may cancel only while `PLACED`. The management queue contains no
accept button and no delivery-code input.
