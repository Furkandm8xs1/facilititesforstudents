# API Application

The API is a NestJS application that exposes the business capabilities of the
portal under `/api/v1`. It is deliberately organized as a modular monolith so
that `core`, `wallet`, and `canteen` can later be separated without mixing
their business rules today.

## Bootstrap sequence

1. [`src/main.ts`](./src/main.ts) creates the NestJS application.
2. The global URL prefix is set to `api/v1`.
3. CORS is enabled for the configured web origin.
4. Shutdown hooks are enabled so the PostgreSQL pool can close cleanly.
5. [`src/app.module.ts`](./src/app.module.ts) loads configuration,
   authentication, database access, and all business modules.
6. Global authentication and authorization guards protect every endpoint
   except controllers or handlers marked with `@Public()`.

## Source map

| Path                                                      | Purpose                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| [`src/auth/`](./src/auth/README.md)                       | Keycloak JWT verification and role guards                    |
| [`src/database/`](./src/database/README.md)               | PostgreSQL pool and transaction helper                       |
| [`src/health/`](./src/health/)                            | Public health endpoint                                       |
| [`src/modules/core/`](./src/modules/core/README.md)       | Application profiles and administrator user creation         |
| [`src/modules/wallet/`](./src/modules/wallet/README.md)   | Shared balance, cash deposits, reversals, and ledger history |
| [`src/modules/canteen/`](./src/modules/canteen/README.md) | Canteen catalog, stock, orders, refunds, and order status    |
| [`migrations/`](./migrations/README.md)                   | Ordered PostgreSQL schema evolution                          |
| [`scripts/`](./scripts/README.md)                         | Operational scripts, currently the migration runner          |

## Configuration

The API reads `.env.local` first and `.env` second.

| Variable                          | Meaning                                                |
| --------------------------------- | ------------------------------------------------------ |
| `API_PORT`                        | HTTP port, default `3001`                              |
| `CORS_ORIGIN`                     | Allowed web origin                                     |
| `DATABASE_URL`                    | PostgreSQL connection string                           |
| `KEYCLOAK_ISSUER`                 | Expected token issuer and JWKS base URL                |
| `KEYCLOAK_AUDIENCE`               | Required access-token audience, normally `portal-api`  |
| `KEYCLOAK_ADMIN_CLIENT_ID`        | Service account used for user provisioning             |
| `KEYCLOAK_ADMIN_CLIENT_SECRET`    | Secret for the provisioning service account            |
| `KEYCLOAK_PORTAL_API_CLIENT_UUID` | Internal Keycloak UUID used for client-role assignment |

Use [`.env.example`](./.env.example) as the local template. Do not commit real
secrets.

## Commands

Run these from the repository root:

```bash
npm run dev:api
npm run db:migrate
npm run lint --workspace @hizmet/api
npm run test --workspace @hizmet/api
npm run build --workspace @hizmet/api
```

## HTTP pipeline

For a protected request, NestJS processes the request in this order:

1. `JwtAuthGuard` extracts and verifies the Bearer token.
2. The verified identity is attached to `request.user`.
3. `RolesGuard` checks required realm/client roles.
4. A controller selects the use case and passes raw input to a service.
5. An input parser normalizes and validates untrusted values.
6. The service calls a repository and translates domain errors into HTTP
   exceptions.
7. The repository executes parameterized SQL, using a transaction for a
   multi-step mutation.
8. Response view types convert PostgreSQL `BIGINT` fields to strings so JSON
   never loses integer precision.

## Testing convention

- `*.input.spec.ts` verifies parsing, normalization, limits, and invalid input.
- `*.service.spec.ts` verifies domain errors are mapped to the expected HTTP
  behavior.
- Guard tests verify role combinations and public/protected behavior.
- Financial and stock flows should also be tested against PostgreSQL because
  row locking and constraints cannot be fully represented by mocks.
