# Laundry

The laundry module exposes authenticated customer views under `/laundry` and
operator/manager workflows under `/laundry/manage`.

- Machines are fixed in code: `Y01`-`Y07` and `K01`-`K08`.
- Every machine run lasts 2 hours 30 minutes. Its expected finish time is
  stored as an immutable snapshot, and clothes cannot be removed or transferred
  earlier.
- Starting or transferring to a machine snapshots the current tariff and
  captures it from the customer's wallet in the same database transaction.
- A load keeps every machine run and immutable event as history.
- Completing removes the active run. Refunding removes it when necessary and
  returns the sum of all run snapshots with one `SERVICE_REFUND` ledger entry.
- `laundry_operator` and `laundry_manager` may operate loads; only
  `laundry_manager` may update whole-TL tariffs.

Request idempotency keys must be 8-120 characters. Reusing a key with different
parameters returns a conflict and never creates a second wallet charge.
