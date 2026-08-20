# Shared Web Libraries

## Typed API client

[`api.ts`](./api.ts) is the server-side HTTP boundary between Next.js and
NestJS. It contains:

- response and payload interfaces;
- authenticated read helpers;
- wallet mutation helpers;
- canteen catalog/order/product helpers;
- common error-response normalization.

All requests use `process.env.API_BASE_URL`, attach the Keycloak access token as
a Bearer token, and use `cache: 'no-store'` for current operational data.

### Read helper behavior

Read helpers return either typed data, `null`, or an empty collection depending
on the screen's fallback needs. They log only the HTTP status on failure; token
contents and sensitive response bodies must not be logged.

### Mutation helper behavior

Mutation helpers:

1. Select method and API path.
2. Add Bearer and JSON headers.
3. Serialize the typed payload.
4. Parse the API's message and optional field-error map.
5. Return a serializable `{ ok, message, errors }` result to the server action.

When adding an endpoint, add its types and helper here instead of issuing ad hoc
`fetch` calls from components.

## Money formatting

[`money.ts`](./money.ts) formats a minor-unit string as Turkish lira without
floating-point conversion.

Use it for balances, ledger deltas, product prices, order lines, and totals.
The API intentionally returns money as strings because PostgreSQL `BIGINT` may
exceed JavaScript's safe integer range.
