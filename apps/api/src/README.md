# API Source Layout

This directory is the composition root and implementation of the NestJS API.

## Entry files

| File                               | Responsibility                                                           |
| ---------------------------------- | ------------------------------------------------------------------------ |
| [`main.ts`](./main.ts)             | Starts HTTP, configures the prefix and CORS, and listens on the API port |
| [`app.module.ts`](./app.module.ts) | Imports infrastructure and business modules                              |

## Request-oriented reading order

When tracing a request, read files in this order:

1. Find the route in a `*.controller.ts` file.
2. Check class-level and method-level role decorators.
3. Follow the call into the matching `*.service.ts` file.
4. Read the corresponding `*.input.ts` parser for accepted input and limits.
5. Read the `*.repository.ts` method for locking, SQL, and transaction details.
6. Read the migration that defines the tables and constraints used by that
   repository.
7. Read nearby `*.spec.ts` files for examples and protected edge cases.

## Dependency direction

```text
controller -> service -> repository -> PostgresService
                  |
                  +-> input parser / domain error mapping
```

Controllers must stay thin. SQL belongs in repositories. Raw request values
must be parsed before reaching repository methods. Repositories throw domain
rule errors when a conflict is expected; services convert those errors into
stable HTTP responses.

## Cross-cutting directories

- [`auth/`](./auth/README.md): global identity and role enforcement.
- [`database/`](./database/README.md): the only shared PostgreSQL connection
  abstraction.
- [`health/`](./health/): a public endpoint used to confirm that the process is
  responding.
- [`modules/`](./modules/README.md): business capabilities and their internal
  boundaries.
