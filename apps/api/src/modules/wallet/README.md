# Wallet Module

The wallet module provides one shared TRY balance for every user. The same
account will be used by canteen, laundry, kitchen, and future services.

## Endpoints

| Method | Path                                               | Role             | Purpose                                       |
| ------ | -------------------------------------------------- | ---------------- | --------------------------------------------- |
| `GET`  | `/api/v1/wallet/me`                                | Authenticated    | Return the caller's account and recent ledger |
| `GET`  | `/api/v1/wallet/cashier/accounts?phone=...`        | `wallet_cashier` | Search accounts by phone prefix               |
| `GET`  | `/api/v1/wallet/cashier/accounts/:accountId`       | `wallet_cashier` | Inspect one account and its ledger            |
| `POST` | `/api/v1/wallet/cashier/deposits`                  | `wallet_cashier` | Add cash-backed balance                       |
| `POST` | `/api/v1/wallet/cashier/deposits/:entryId/reverse` | `wallet_cashier` | Reverse one cash deposit in full              |

## Data model

- `wallet.account` stores the current `available_minor` and `held_minor`
  projections.
- `wallet.ledger_entry` is the immutable source of money movements.
- Every amount is an integer number of kuruş represented as `BIGINT`.
- Updating or deleting a ledger row is blocked by a database trigger.

Ledger entry types:

| Type                    | Meaning                                 |
| ----------------------- | --------------------------------------- |
| `CASH_DEPOSIT`          | Cash was received and balance increased |
| `CASH_DEPOSIT_REVERSAL` | A cash load was corrected in full       |
| `HOLD`                  | A service amount was reserved logically |
| `CAPTURE`               | A service purchase was finalized        |
| `RELEASE`               | A previous hold was released            |
| `SERVICE_REFUND`        | A completed service charge was refunded |

## Cash deposit flow

1. The input parser validates E.164 phone, whole-TL amount, and UUID
   idempotency key.
2. The repository resolves the active cashier profile.
3. It locks the target wallet account.
4. Loading the cashier's own wallet is rejected.
5. An existing idempotency key returns the original result only when the target
   and amount match.
6. A `CASH_DEPOSIT` ledger row is inserted.
7. `available_minor` is increased in the same transaction.

## Cash reversal flow

1. The original ledger row and account are locked.
2. Only `CASH_DEPOSIT` can be reversed by a cashier.
3. The deposit must not already have a reversal.
4. Available balance must cover the complete original amount.
5. A reason of 3-500 characters is required.
6. A linked `CASH_DEPOSIT_REVERSAL` row is inserted.
7. Available balance is reduced by the full original amount.

Cashiers cannot reverse canteen charges or service refunds. Those movements are
owned by the service that created them.

## Files

- [`wallet.controller.ts`](./wallet.controller.ts): user's own wallet endpoint.
- [`cashier-wallet.controller.ts`](./cashier-wallet.controller.ts): cashier
  routes and role boundary.
- [`wallet.input.ts`](./wallet.input.ts): phone, amount, UUID, and reason
  validation.
- [`wallet.service.ts`](./wallet.service.ts): use cases and HTTP error mapping.
- [`wallet.repository.ts`](./wallet.repository.ts): ledger SQL, row locks,
  idempotency, and account projection updates.
- [`wallet.errors.ts`](./wallet.errors.ts): expected wallet rule failures.
