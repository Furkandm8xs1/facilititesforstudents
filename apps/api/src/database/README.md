# Database Access

[`postgres.service.ts`](./postgres.service.ts) is the shared PostgreSQL access
layer. Business modules receive it through NestJS dependency injection.

## Direct queries

`PostgresService.query` delegates to the `pg` connection pool. Repositories use
parameterized placeholders (`$1`, `$2`, and so on); request values must never
be interpolated into SQL text.

Use a direct query for a single read or a truly atomic single statement.

## Transactions

`PostgresService.withTransaction` performs the complete lifecycle:

1. Acquire a dedicated connection from the pool.
2. Execute `BEGIN`.
3. Run the repository callback with the same `PoolClient`.
4. Execute `COMMIT` when the callback succeeds.
5. Execute `ROLLBACK` when any step throws.
6. Release the connection in `finally`.

Use a transaction whenever one business action changes more than one row or
table. Wallet deposits, reversals, product mutations, order placement, order
status changes, and refunds all rely on this rule.

## Concurrency rules

- Lock mutable money, stock, and order rows with `FOR UPDATE` before checking
  and changing them.
- Acquire locks in a stable order to reduce deadlock risk.
- Validate limits again after a lock; values may have changed since the page
  was rendered.
- Let database constraints remain the final safety net.
- Return `BIGINT` columns as `::text` and expose them as strings in JSON.

## Shutdown

The service implements `OnModuleDestroy` and closes the pool when NestJS shuts
down. This is why the bootstrap enables shutdown hooks.
