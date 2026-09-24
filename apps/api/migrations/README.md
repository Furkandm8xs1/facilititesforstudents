# Database Migrations

Migrations are immutable, ordered SQL files executed by
[`../scripts/migrate.ts`](../scripts/migrate.ts). Applied filenames are recorded
in `public.schema_migration`.

## Migration history

| File                                                                       | Main changes                                                                                                                                              |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`001_core.sql`](./001_core.sql)                                           | Enables `pgcrypto`; creates `core`, `wallet`, `canteen`, and `audit` schemas; creates user profiles and service units; seeds `canteen-main`               |
| [`002_wallet.sql`](./002_wallet.sql)                                       | Creates wallet accounts and immutable ledger entries; adds indexes; creates a wallet automatically for every profile                                      |
| [`003_canteen_catalog.sql`](./003_canteen_catalog.sql)                     | Creates canteen stores, products, product events, catalog constraints, and product-event immutability                                                     |
| [`004_canteen_orders.sql`](./004_canteen_orders.sql)                       | Introduces orders, immutable price/name snapshots, events, initial workflow fields, and order indexes                                                     |
| [`005_simplify_canteen_orders.sql`](./005_simplify_canteen_orders.sql)     | Converts pending orders to immediate capture, removes acceptance/rejection states, drops the delivery code, and installs the simplified status constraint |
| [`006_tea_cafe.sql`](./006_tea_cafe.sql)                                   | Adds the Tea & Cafe service unit and timed brew records                                                                                                   |
| [`007_laundry.sql`](./007_laundry.sql)                                     | Adds fixed-machine laundry tariffs, loads, price-snapshotted runs, immutable events, occupancy constraints, and idempotency                               |
| [`008_laundry_run_history_guard.sql`](./008_laundry_run_history_guard.sql) | Restricts machine-run updates to the one-way in-machine to removed transition                                                                             |
| [`009_laundry_run_timing.sql`](./009_laundry_run_timing.sql)               | Adds the fixed 150-second machine duration, expected finish time, and immutable timing snapshots                                                          |
| [`010_laundry_fixed_duration.sql`](./010_laundry_fixed_duration.sql)       | Enforces the 150-second duration at the database boundary                                                                                                 |
| [`011_laundry_run_duration.sql`](./011_laundry_run_duration.sql)           | Changes every machine run to 2 hours 30 minutes and recalculates existing expected finish times                                                           |

The fourth migration describes the original order design. The fifth migration
is intentionally separate because migration history must show how an existing
database moved to the current design.

## Applying migrations

From the repository root:

```bash
npm run db:migrate
```

The runner:

1. Acquires a PostgreSQL advisory lock so only one migration process runs.
2. Creates `public.schema_migration` if needed.
3. Sorts `.sql` files by filename.
4. Skips filenames already recorded as applied.
5. Runs each new file in its own transaction.
6. Records the filename only after the SQL succeeds.
7. Rolls back the complete file on failure.

## Adding a migration

1. Never edit a migration that may already be applied outside your local
   database.
2. Create the next zero-padded filename, for example `006_feature_name.sql`.
3. Make the migration safe for current production data, not only an empty
   database.
4. Add constraints and indexes alongside the new data model.
5. Preserve financial and audit history; do not update/delete immutable ledger
   or event rows.
6. Run migration, tests, lint, and build.
7. Update this file and the affected module README.
