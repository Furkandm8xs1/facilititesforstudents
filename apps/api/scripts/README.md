# API Operational Scripts

## Migration runner

[`migrate.ts`](./migrate.ts) applies SQL files from `../migrations`.

Technical sequence:

1. Read `DATABASE_URL`, with a local development fallback.
2. Open one PostgreSQL pool and acquire a client.
3. Acquire a fixed advisory lock for migration serialization.
4. Ensure the migration tracking table exists.
5. Read and lexically sort all `.sql` files.
6. Query the tracking table before each file.
7. Execute an unapplied file inside `BEGIN`/`COMMIT`.
8. Insert the filename into the tracking table in the same transaction.
9. Roll back and stop immediately when a migration fails.
10. Release the advisory lock and close the pool.

Run it through the package script instead of calling the TypeScript file
directly:

```bash
npm run db:migrate
```
