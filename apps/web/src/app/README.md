# App Router Screens and Actions

This directory contains the Next.js App Router tree.

## Shared files

| File                                                                   | Responsibility                                              |
| ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`layout.tsx`](./layout.tsx)                                           | Root HTML language, metadata, and global stylesheet         |
| [`globals.css`](./globals.css)                                         | Shared portal, wallet, canteen, form, and responsive styles |
| [`page.tsx`](./page.tsx)                                               | Authenticated portal home and role-aware navigation         |
| [`login/page.tsx`](./login/page.tsx)                                   | Public login screen                                         |
| [`api/auth/[...nextauth]/route.ts`](./api/auth/[...nextauth]/route.ts) | Exposes NextAuth GET/POST handlers                          |

## Feature areas

- [`admin/`](./admin/README.md): administrator user creation.
- [`wallet/`](./wallet/README.md): balance history and cash operations.
- [`canteen/`](./canteen/README.md): customer ordering and staff operations.

## Page implementation pattern

Authenticated pages follow this sequence:

1. Call `auth()` in the server component.
2. Redirect to `/login` when the user or API token is absent.
3. Redirect to `/` when a required application role is absent.
4. Fetch current data with `cache: 'no-store'` API helpers.
5. Render read-only values directly in the server component.
6. Pass only display data and identifiers to client components.

## Server action pattern

Each mutation feature keeps an `actions.ts` file next to its forms:

1. Mark the module with `'use server'`.
2. Define a serializable action state with `idle`, `success`, and `error`.
3. Read the session and repeat authorization.
4. Convert `FormData` values to strings or string arrays.
5. Call a typed helper from `@/lib/api`.
6. Revalidate all pages that display affected data.
7. Return API field errors so the client form can render them.

Client form components use `useActionState`. They disable submit buttons while
pending and render messages through an `aria-live` region.

## Cache invalidation

Mutation actions explicitly revalidate related views. For example, an order can
change all of these at once:

- `/` because the shared balance is visible there;
- `/wallet` because ledger and balance changed;
- `/canteen` because stock, balance, and order history changed;
- `/canteen/manage` because the queue and stock changed.

When adding a new page that displays shared state, update the corresponding
action's revalidation list.
