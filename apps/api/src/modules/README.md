# Business Modules

Each directory in this folder owns one business capability and follows the
same layering convention.

## File roles

| Pattern           | Responsibility                                                           |
| ----------------- | ------------------------------------------------------------------------ |
| `*.module.ts`     | Registers controllers and providers with NestJS                          |
| `*.controller.ts` | Declares HTTP paths, methods, role metadata, and request identity access |
| `*.input.ts`      | Parses unknown values into trusted domain input                          |
| `*.service.ts`    | Coordinates use cases and maps domain failures to HTTP errors            |
| `*.repository.ts` | Owns SQL, transactions, row locking, and response views                  |
| `*.errors.ts`     | Defines expected domain rule failures independent of HTTP                |
| `*.spec.ts`       | Documents behavior through executable tests                              |

## Module boundaries

- [`core/`](./core/README.md) owns application users and PostgreSQL profiles.
- [`wallet/`](./wallet/README.md) owns balances and the immutable money ledger.
- [`canteen/`](./canteen/README.md) owns stores, products, stock, and orders.

The modules may share the same PostgreSQL transaction today, but tables remain
grouped by PostgreSQL schema and code remains grouped by capability. This keeps
future service extraction possible without premature network boundaries.

## Adding a use case

1. Define the endpoint and narrow role requirement in a controller.
2. Parse every body, path, and query value from `unknown`.
3. Add a service method that names the business action.
4. Put atomic data work and locking in a repository transaction.
5. Add a domain error code for expected conflicts.
6. Map that error to a stable, user-readable HTTP exception in the service.
7. Add input and service tests, then update the module README.
