# Web Application

The web application is a Next.js 16 App Router project using React 19 and
NextAuth 5. It renders the portal UI, owns the browser login session, performs
role-aware routing, and calls the NestJS API from server-side code.

## Responsibilities

- Redirect unauthenticated users to Keycloak through NextAuth.
- Refresh expired Keycloak access tokens on the server.
- Expose only recognized application roles to pages and server actions.
- Render authenticated server components with fresh API data.
- Submit mutations through server actions rather than exposing API tokens to
  client components.
- Revalidate affected pages after successful mutations.
- Present domain errors returned by the API next to the relevant form fields.

## Route map

| Route                     | Access                                  | Purpose                                                  |
| ------------------------- | --------------------------------------- | -------------------------------------------------------- |
| `/login`                  | Public                                  | Starts Keycloak login                                    |
| `/`                       | Authenticated                           | Portal home, service links, identity, and shared balance |
| `/admin/users/new`        | `platform_admin`                        | Create users and assign roles                            |
| `/wallet`                 | Authenticated                           | View the caller's balance and ledger                     |
| `/wallet/cashier`         | `wallet_cashier`                        | Search users, load cash, and reverse deposits            |
| `/canteen`                | Authenticated                           | Browse products, order, cancel, and track status         |
| `/canteen/manage`         | `canteen_manager` or `canteen_operator` | Operate orders and manage catalog/stock                  |
| `/tea-cafe`               | Authenticated                           | Follow live tea and coffee readiness                     |
| `/tea-cafe/manage`        | `tea_cafe_attendant`                    | Create and remove brew records                           |
| `/api/auth/[...nextauth]` | NextAuth                                | OAuth/OIDC callback and session endpoints                |

## Configuration

| Variable               | Meaning                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `AUTH_SECRET`          | Encrypts/signs the NextAuth session JWT                     |
| `AUTH_TRUST_HOST`      | Allows the configured local host during development         |
| `AUTH_KEYCLOAK_ID`     | Keycloak client ID for the web application                  |
| `AUTH_KEYCLOAK_SECRET` | Keycloak web client secret                                  |
| `AUTH_KEYCLOAK_ISSUER` | Keycloak realm issuer                                       |
| `API_BASE_URL`         | Server-side base URL of the NestJS API, including `/api/v1` |

Use [`.env.example`](./.env.example) as a template. The API token must remain on
the server; do not pass it to client component props.

## Commands

From the repository root:

```bash
npm run dev:web
npm run lint --workspace @hizmet/web
npm run build --workspace @hizmet/web
```

## Detailed guides

- [Web source layout](./src/README.md)
- [Authentication and session lifecycle](./src/AUTHENTICATION.md)
- [App Router and server actions](./src/app/README.md)
- [Administrator UI](./src/app/admin/README.md)
- [Wallet UI](./src/app/wallet/README.md)
- [Canteen UI](./src/app/canteen/README.md)
- [Shared API and money helpers](./src/lib/README.md)
