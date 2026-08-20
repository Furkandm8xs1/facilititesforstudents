# Web Source Layout

This directory contains the application code that runs in Next.js.

## Top-level files

| Path                                             | Responsibility                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| [`auth.ts`](./auth.ts)                           | NextAuth Keycloak provider, token refresh, role extraction, and session construction  |
| [`proxy.ts`](./proxy.ts)                         | Re-exports the NextAuth proxy and defines protected-path matching                     |
| [`app/`](./app/README.md)                        | Pages, layouts, client forms, and server actions                                      |
| [`lib/`](./lib/README.md)                        | Typed NestJS API client and money formatter                                           |
| [`types/next-auth.d.ts`](./types/next-auth.d.ts) | Adds API token, roles, expiry, refresh token, and auth error fields to NextAuth types |

## Server/client boundary

- Pages are server components unless they explicitly contain `'use client'`.
- Server components call `auth()` and the typed API client directly.
- Client components own interactive form state through `useActionState`.
- Server actions contain `'use server'`, re-read the authenticated session, and
  call the API with the server-only access token.
- Client components never receive the Keycloak access token.

## Typical read flow

1. The proxy requires a session for the requested page.
2. The page calls `auth()` and redirects if the session is missing.
3. The page performs any role-specific redirect.
4. The page calls one or more functions from `lib/api.ts` with the server-side
   access token.
5. Data is rendered into server and client components.

## Typical mutation flow

1. A client form submits to a server action.
2. The server action calls `auth()` again; UI visibility is not treated as
   authorization.
3. The action normalizes `FormData` into a typed API payload.
4. `lib/api.ts` sends a Bearer-authenticated request to NestJS.
5. The action returns `success` or `error` state and field errors.
6. Successful actions call `revalidatePath` for every page affected by the
   changed balance, stock, catalog, or order.

Read [AUTHENTICATION.md](./AUTHENTICATION.md) before changing token or role
behavior.
