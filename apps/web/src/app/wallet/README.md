# Wallet UI

The wallet screens expose the shared TRY account and the restricted cash desk.

## User wallet route

`/wallet` is available to every authenticated user.

[`page.tsx`](./page.tsx):

1. Reads the session and redirects to `/login` when necessary.
2. Calls `getWalletOverview` with the server-side access token.
3. Displays available balance, held balance, and recent immutable ledger rows.
4. Maps internal ledger types to user-readable Turkish labels.
5. Links cashiers to the separate cash management screen.

## Cashier route

`/wallet/cashier` requires `wallet_cashier`.

1. [`cashier/page.tsx`](./cashier/page.tsx) validates authentication and role.
2. The `phone` search parameter is sent to the cashier account-search API.
3. A selected `account` parameter loads that wallet and its recent entries.
4. [`cash-deposit-form.tsx`](./cashier/cash-deposit-form.tsx) submits a whole-TL
   cash load.
5. Eligible cash deposit rows render
   [`reverse-deposit-form.tsx`](./cashier/reverse-deposit-form.tsx).

## Mutation flow

[`cashier/actions.ts`](./cashier/actions.ts) owns both mutations:

- `createCashDepositAction` sends phone, whole-TL amount, and idempotency UUID.
- `reverseCashDepositAction` sends the original entry ID, reason, and a new
  idempotency UUID.

The client forms generate UUIDs in the browser after mount. A successful action
generates a fresh UUID so a later intentional operation is not mistaken for a
retry. The API remains responsible for final idempotency enforcement.

After success, the portal home, wallet page, and cashier page are revalidated.

## Display rule

Use `formatTryMinor` from `@/lib/money`; do not parse minor-unit strings into
JavaScript floating-point numbers.
