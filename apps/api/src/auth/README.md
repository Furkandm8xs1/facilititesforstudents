# API Authentication and Authorization

This directory protects the API with Keycloak-issued access tokens. The guards
are registered globally, so new endpoints are protected by default.

## Authentication flow

1. The web application sends `Authorization: Bearer <access-token>`.
2. [`jwt-auth.guard.ts`](./jwt-auth.guard.ts) skips verification only when
   `@Public()` metadata is present.
3. [`keycloak-jwt.service.ts`](./keycloak-jwt.service.ts) downloads and caches
   Keycloak public keys through the issuer JWKS endpoint.
4. `jose.jwtVerify` validates the RS256 signature, issuer, audience, and token
   lifetime.
5. `authUserFromClaims` extracts `sub`, `preferred_username`, realm roles, and
   `portal-api` client roles.
6. The guard assigns that normalized identity to `request.user`.
7. [`roles.guard.ts`](./roles.guard.ts) combines realm and client roles and
   checks route metadata.

## Files

| File                                                     | Responsibility                                         |
| -------------------------------------------------------- | ------------------------------------------------------ |
| [`auth.module.ts`](./auth.module.ts)                     | Registers JWT and role guards as `APP_GUARD` providers |
| [`keycloak-jwt.service.ts`](./keycloak-jwt.service.ts)   | Verifies tokens and normalizes claims                  |
| [`jwt-auth.guard.ts`](./jwt-auth.guard.ts)               | Enforces Bearer authentication and attaches the user   |
| [`roles.guard.ts`](./roles.guard.ts)                     | Enforces required application roles                    |
| [`roles.decorator.ts`](./roles.decorator.ts)             | Defines all-role and any-role metadata decorators      |
| [`public.decorator.ts`](./public.decorator.ts)           | Marks a route as intentionally unauthenticated         |
| [`auth-user.ts`](./auth-user.ts)                         | Shape of the normalized token identity                 |
| [`authenticated-request.ts`](./authenticated-request.ts) | Request type after successful authentication           |

## Role decorators

- `@RequireRoles('a', 'b')` requires every listed role.
- `@RequireAnyRole('a', 'b')` requires at least one listed role.
- Both decorators can be combined; both conditions must then pass.
- Without role metadata, any authenticated identity can call the endpoint.

Current application roles:

| Role               | Main authority                                                |
| ------------------ | ------------------------------------------------------------- |
| `portal_user`      | General portal access                                         |
| `platform_admin`   | Create application users                                      |
| `wallet_cashier`   | Search wallets, load cash, and reverse cash deposits          |
| `canteen_manager`  | Full canteen catalog administration                           |
| `canteen_operator` | Canteen stock, visibility, ordering state, and order workflow |

## Adding a protected endpoint

1. Do not add `@Public()`.
2. Read identity from `AuthenticatedRequest`; never trust a subject sent in the
   body.
3. Add the narrowest suitable role decorator.
4. Keep the same authorization check in the web server action for user
   feedback, while treating this API guard as the security boundary.
5. Add guard or controller tests when introducing a new role combination.
