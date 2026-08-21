# Core User Module

The core module connects a Keycloak identity to the portal's PostgreSQL user
profile. Keycloak owns credentials; PostgreSQL owns application data.

## Endpoints

| Method  | Path                                | Role             | Purpose                                                    |
| ------- | ----------------------------------- | ---------------- | ---------------------------------------------------------- |
| `GET`   | `/api/v1/me`                        | Authenticated    | Return token identity plus the matching PostgreSQL profile |
| `GET`   | `/api/v1/admin/users`               | `platform_admin` | List eligible Keycloak users with their application roles  |
| `POST`  | `/api/v1/admin/users`               | `platform_admin` | Create a user, temporary password, roles, and profile      |
| `PATCH` | `/api/v1/admin/users/:userId/roles` | `platform_admin` | Replace one user's assignable application roles            |

## User creation flow

1. [`admin-users.controller.ts`](./admin/admin-users.controller.ts) requires
   `platform_admin` and forwards the unknown body.
2. [`create-user.input.ts`](./admin/create-user.input.ts) validates names,
   E.164 phone number, 10-128 character temporary password, and assignable
   roles.
3. [`user-provisioning.service.ts`](./admin/user-provisioning.service.ts)
   always includes `portal_user` and separates realm roles from `portal-api`
   client roles.
4. [`keycloak-admin.service.ts`](./admin/keycloak-admin.service.ts) obtains a
   client-credentials administration token.
5. Keycloak creates an enabled user whose username is the phone number and
   whose password is temporary.
6. Realm and client roles are assigned through Keycloak Admin API mappings.
7. [`user-profile.repository.ts`](./user-profile.repository.ts) inserts the
   corresponding `core.user_profile` row.
8. The PostgreSQL trigger defined by the wallet migration automatically creates
   the user's shared wallet account.
9. The response reports that the password must be changed on first login.

## Compensation behavior

Keycloak and PostgreSQL cannot share one transaction. The provisioning service
therefore applies compensation:

- If Keycloak creation or role assignment fails, no PostgreSQL profile is
  written.
- If PostgreSQL profile creation fails, the newly created Keycloak user is
  deleted.
- If that cleanup also fails, the API returns a high-severity error so an
  administrator can repair the partial record.

## Role administration

The user list comes directly from Keycloak and excludes service accounts and
accounts that still have the `UPDATE_PASSWORD` required action. A PostgreSQL
profile is not required for visibility or role assignment, so a stale or
missing profile-to-subject link cannot hide an authenticated user. Current
application roles are read from Keycloak. Role updates use the Keycloak user ID,
preserve `portal_user` and all unmanaged Keycloak roles, replace only the
portal's assignable realm/client roles, and reject attempts by an administrator
to remove their own `platform_admin` role.

## Data ownership

`core.user_profile` stores:

- the immutable Keycloak subject link;
- unique E.164 phone number;
- first and last name;
- lifecycle state: `ACTIVE`, `SUSPENDED`, or `DEPARTED`;
- creation and update timestamps.

Business repositories resolve the authenticated Keycloak subject to an active
profile instead of accepting profile IDs from the browser.
