# Administrator UI

The administrator feature currently creates managed portal users.

## Route

`/admin/users/new` requires `platform_admin`.

## Render flow

1. [`users/new/page.tsx`](./users/new/page.tsx) reads the NextAuth session.
2. Missing authentication redirects to `/login`.
3. Missing `platform_admin` redirects to `/`.
4. The page renders [`create-user-form.tsx`](./users/new/create-user-form.tsx).

## Form flow

1. The client component collects first name, last name, E.164 phone number,
   temporary password, and selected roles.
2. `useActionState` submits to
   [`users/new/actions.ts`](./users/new/actions.ts).
3. The server action rechecks `platform_admin`.
4. It converts `FormData` into a `CreateUserPayload`.
5. `createUser` in `@/lib/api` calls `POST /admin/users`.
6. API validation errors are returned by field name and displayed by the form.
7. On success the form resets, and the new user must change the temporary
   password on first Keycloak login.

## Important boundary

The web action does not call Keycloak directly. The NestJS core module owns the
Keycloak Admin API and compensates for partial Keycloak/PostgreSQL failures.
