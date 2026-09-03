# Applications

This directory contains the executable applications in the dormitory services
portal. The repository is a monorepo, but the runtime is currently a modular
monolith: one web application, one API application, one PostgreSQL database,
and one Keycloak identity server.

## Application map

| Path                      | Runtime | Responsibility                                                                          |
| ------------------------- | ------- | --------------------------------------------------------------------------------------- |
| [`api/`](./api/README.md) | NestJS  | Authentication enforcement, business rules, PostgreSQL transactions, and HTTP endpoints |
| [`web/`](./web/README.md) | Next.js | Login session, role-aware pages, forms, server actions, and API calls                   |

## End-to-end request flow

1. A user opens the Next.js application.
2. NextAuth redirects an unauthenticated user to Keycloak.
3. Keycloak authenticates the phone-number username and returns tokens.
4. NextAuth stores the access token, refresh token, expiry, and application
   roles in its encrypted JWT session.
5. A server component or server action reads the session with `auth()`.
6. The web API client sends the Keycloak access token to NestJS as a Bearer
   token.
7. The global JWT guard verifies signature, issuer, audience, and expiry.
8. The global roles guard checks route metadata when a role is required.
9. The selected business module validates input and executes its PostgreSQL
   work, usually in one transaction.

## Shared rules

- Keycloak owns credentials, login, password changes, and role claims.
- PostgreSQL owns application profiles, wallets, products, stock, orders, and
  immutable financial/audit history.
- Money is stored as integer minor units. `3500` means `35.00 TRY`.
- TypeScript uses `bigint` for money and stock calculations in the API.
- Browser input is untrusted. Validation is repeated in the API even when the
  HTML form already has constraints.
- Authorization is checked in both the web server action and the API. The API
  check is authoritative.
- Financial, stock, and order mutations use PostgreSQL transactions and row
  locks where concurrency matters.
- Idempotency keys prevent a repeated form submission from creating duplicate
  money movements or duplicate orders.

## Detailed guides

- [API overview](./api/README.md)
- [API source layout](./api/src/README.md)
- [Authentication and roles](./api/src/auth/README.md)
- [Database access](./api/src/database/README.md)
- [Business module conventions](./api/src/modules/README.md)
- [User and profile module](./api/src/modules/core/README.md)
- [Wallet module](./api/src/modules/wallet/README.md)
- [Canteen module](./api/src/modules/canteen/README.md)
- [Tea & Cafe module](./api/src/modules/tea-cafe/README.md)
- [Database migrations](./api/migrations/README.md)
- [Web overview](./web/README.md)
- [Web source layout](./web/src/README.md)
- [App Router screens](./web/src/app/README.md)
