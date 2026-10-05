# `core` Schema — Users and Service Units

Created by [`001_core.sql`](../../apps/api/migrations/001_core.sql); the
`service_unit.kind` list was extended in
[`006_tea_cafe.sql`](../../apps/api/migrations/006_tea_cafe.sql).

These tables are the hubs of the whole database. Almost every other table
references `core.user_profile` (who owns / who acted) or `core.service_unit`
(which service the row belongs to).

## At a glance

| Table                          | Role in the system       | Rows are…                              | Approx. volume                  |
| ------------------------------ | ------------------------ | -------------------------------------- | ------------------------------- |
| `core.user_profile`            | **Entity** – a person    | created on first sign-in, never purged | one per Keycloak user           |
| `core.service_unit`            | **Entity** – a service   | seeded by migrations                   | a handful (canteen, laundry, …) |
| `core.user_service_assignment` | **Association** (bridge) | reserved for per-unit roles            | user × service unit × role      |

**Why two hubs?** Almost every row must answer two questions: *"who did this /
who owns this?"* → `user_profile`, and *"which service is this about?"* →
`service_unit`. Keeping both in `core` lets every service schema stay small and
independent of the others.

## Entity–relationship diagram

Notation: `PK` primary key, `FK` foreign key, `UK` unique key. Crow's-foot
symbols: `||` exactly one, `o|` zero or one, `o{` zero or many, `|{` one or many.

```mermaid
erDiagram
    USER_PROFILE ||--o{ USER_SERVICE_ASSIGNMENT : "is assigned"
    SERVICE_UNIT ||--o{ USER_SERVICE_ASSIGNMENT : "has staff"

    USER_PROFILE {
        uuid id PK
        uuid keycloak_subject UK "Keycloak sub claim"
        text phone_e164 UK "E.164 phone number"
        text first_name
        text last_name
        text status "ACTIVE, SUSPENDED, DEPARTED"
        timestamptz created_at
        timestamptz updated_at
    }

    SERVICE_UNIT {
        uuid id PK
        text code UK "stable machine code"
        text name
        text kind "CANTEEN, LAUNDRY, KITCHEN, TEA_CAFE"
        boolean active
        timestamptz created_at
    }

    USER_SERVICE_ASSIGNMENT {
        uuid user_profile_id PK, FK
        uuid service_unit_id PK, FK
        text role_code PK
        timestamptz created_at
    }
```

### Reading the diagram

| Relationship                                     | Cardinality | Meaning                                                                          |
| ------------------------------------------------ | ----------- | -------------------------------------------------------------------------------- |
| `user_profile` → `user_service_assignment`       | 1 : N       | A user may hold many (unit, role) pairs, or none at all.                         |
| `service_unit` → `user_service_assignment`       | 1 : N       | A service unit may have many staff members, or none yet.                         |
| `user_profile` ↔ `service_unit` (through bridge) | M : N       | The bridge resolves the many-to-many; its composite PK prevents duplicate roles. |

| Child column (holds the reference) | Referenced column | Cardinality / note | Type |
| --- | --- | --- | --- |
| `core.user_service_assignment.user_profile_id` | `core.user_profile.id` | N : 1 | Foreign key |
| `core.user_service_assignment.service_unit_id` | `core.service_unit.id` | N : 1 | Foreign key |

### Lifecycle of a user profile

```mermaid
stateDiagram-v2
    [*] --> ACTIVE : first sign-in (wallet account auto-created)
    ACTIVE --> SUSPENDED : administrative block
    SUSPENDED --> ACTIVE : unblock
    ACTIVE --> DEPARTED : leaves the organisation
    SUSPENDED --> DEPARTED : leaves the organisation
```

> [!NOTE]
> The `status` values are restricted by a `CHECK` constraint. The transitions
> above describe intended usage and are enforced by the API, not the database.

### Incoming references from other schemas

| Child column (holds the reference) | Referenced column | Cardinality / note | Type |
| --- | --- | --- | --- |
| `wallet.account.user_profile_id` | `core.user_profile.id` | 1 : 1 | Foreign key |
| `wallet.ledger_entry.actor_user_profile_id` | `core.user_profile.id` | N : 0..1 | Foreign key |
| `canteen.product_event.actor_user_profile_id` | `core.user_profile.id` | N : 1 | Foreign key |
| `canteen.customer_order.customer_user_profile_id` | `core.user_profile.id` | N : 1 | Foreign key |
| `canteen.order_event.actor_user_profile_id` | `core.user_profile.id` | N : 1 | Foreign key |
| `tea_cafe.brew.created_by_user_profile_id` | `core.user_profile.id` | N : 1 | Foreign key |
| `tea_cafe.brew.deleted_by_user_profile_id` | `core.user_profile.id` | N : 0..1 | Foreign key |
| `laundry.tariff.updated_by_user_profile_id` | `core.user_profile.id` | N : 0..1 | Foreign key |
| `laundry.load.owner_user_profile_id` | `core.user_profile.id` | N : 1 | Foreign key |
| `laundry.load.created_by_user_profile_id` | `core.user_profile.id` | N : 1 | Foreign key |
| `laundry.machine_run.started_by_user_profile_id` | `core.user_profile.id` | N : 1 | Foreign key |
| `laundry.machine_run.removed_by_user_profile_id` | `core.user_profile.id` | N : 0..1 | Foreign key |
| `laundry.load_event.actor_user_profile_id` | `core.user_profile.id` | N : 1 | Foreign key |
| `canteen.store.service_unit_id` | `core.service_unit.id` | 1 : 1 | Foreign key |
| `tea_cafe.brew.service_unit_id` | `core.service_unit.id` | N : 1 | Foreign key |
| `laundry.tariff.service_unit_id` | `core.service_unit.id` | 1 : 1 | Foreign key |
| `laundry.load.service_unit_id` | `core.service_unit.id` | N : 1 | Foreign key |
| `wallet.ledger_entry.service_code` | `core.service_unit.code` | logical, no FK | Logical (no FK) |

---

## `core.user_profile`

Application-side profile of a person who signs in through Keycloak.

| Column             | Type          | Null | Default             | Constraints / notes                                 |
| ------------------ | ------------- | ---- | ------------------- | --------------------------------------------------- |
| `id`               | `uuid`        | no   | `gen_random_uuid()` | **PK**                                              |
| `keycloak_subject` | `uuid`        | no   |                     | `UNIQUE`; the `sub` claim of the Keycloak token     |
| `phone_e164`       | `text`        | no   |                     | `UNIQUE`; must match `^\+[1-9][0-9]{7,14}$` (E.164) |
| `first_name`       | `text`        | no   |                     | must not be blank                                   |
| `last_name`        | `text`        | no   |                     | must not be blank                                   |
| `status`           | `text`        | no   | `'ACTIVE'`          | `ACTIVE`, `SUSPENDED`, `DEPARTED`                   |
| `created_at`       | `timestamptz` | no   | `now()`             |                                                     |
| `updated_at`       | `timestamptz` | no   | `now()`             |                                                     |

**Triggers**

| Trigger                            | When                | Effect                                                                                 |
| ---------------------------------- | ------------------- | -------------------------------------------------------------------------------------- |
| `create_wallet_account_after_user` | `AFTER INSERT`, row | Calls `wallet.create_account_for_user()`, which inserts the matching `wallet.account`. |

Because of this trigger every user profile always has exactly one wallet
account.

---

## `core.service_unit`

A physical service the organisation operates (canteen, laundry, tea & cafe…).

| Column       | Type          | Null | Default             | Constraints / notes                         |
| ------------ | ------------- | ---- | ------------------- | ------------------------------------------- |
| `id`         | `uuid`        | no   | `gen_random_uuid()` | **PK**                                      |
| `code`       | `text`        | no   |                     | `UNIQUE`; stable machine-readable code      |
| `name`       | `text`        | no   |                     | Display name                                |
| `kind`       | `text`        | no   |                     | `CANTEEN`, `LAUNDRY`, `KITCHEN`, `TEA_CAFE` |
| `active`     | `boolean`     | no   | `true`              |                                             |
| `created_at` | `timestamptz` | no   | `now()`             |                                             |

**Seeded rows**

| `code`          | `name`      | `kind`     | Seeded by          |
| --------------- | ----------- | ---------- | ------------------ |
| `canteen-main`  | Ana Kantin  | `CANTEEN`  | `001_core.sql`     |
| `tea-cafe-main` | Tea & Cafe  | `TEA_CAFE` | `006_tea_cafe.sql` |
| `laundry-main`  | Çamaşırhane | `LAUNDRY`  | `007_laundry.sql`  |

The `code` values are also written into `wallet.ledger_entry.service_code`.

---

## `core.user_service_assignment`

Bridge table that assigns a role to a user inside a service unit.

| Column            | Type          | Null | Default | Constraints / notes                            |
| ----------------- | ------------- | ---- | ------- | ---------------------------------------------- |
| `user_profile_id` | `uuid`        | no   |         | **PK (part)**, **FK** → `core.user_profile.id` |
| `service_unit_id` | `uuid`        | no   |         | **PK (part)**, **FK** → `core.service_unit.id` |
| `role_code`       | `text`        | no   |         | **PK (part)**; free text role name             |
| `created_at`      | `timestamptz` | no   | `now()` |                                                |

Primary key: `(user_profile_id, service_unit_id, role_code)`.

> [!NOTE]
> The current API modules do not read or write this table. Authorization roles
> (`laundry_manager`, `laundry_operator`, …) come from Keycloak token claims.
> The table is reserved for per-unit role assignment.
