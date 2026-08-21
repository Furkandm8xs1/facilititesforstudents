# Administrator UI

The administrator feature lists managed portal users, updates their roles, and
creates new accounts.

## Route

- `/admin/users` requires `platform_admin` and lists portal users with role
  editors.
- `/admin/users/new` requires `platform_admin` and creates a managed account.

## Render flow

1. The administrator page reads the NextAuth session.
2. Missing authentication redirects to `/login`.
3. Missing `platform_admin` redirects to `/`.
4. The users page loads `GET /admin/users`, which reads Keycloak directly and
   returns accounts that completed their first password change without
   requiring a PostgreSQL profile, then renders them as table rows.
5. The page derives an eight-role, two-by-four summary from the already loaded
   user data without making another API request.
6. The new-user page renders
   [`create-user-form.tsx`](./users/new/create-user-form.tsx).

## Role update flow

1. Each user table row expands on click; the collapsed row keeps roles hidden.
2. The expanded editor displays the required `portal_user` role and the shared
   assignable role catalog.
3. `users/actions.ts` rechecks `platform_admin` before calling the API.
4. The API updates only managed application roles in Keycloak.
5. An administrator cannot remove their own `platform_admin` role.
6. The page is revalidated after a successful update.

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
