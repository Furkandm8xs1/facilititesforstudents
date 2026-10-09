# SQL Tutorial and Lookup Guide

A hands-on guide that takes you from **"what is a table?"** to the **advanced
queries this project runs in production**. Every example uses the real tables of
the `hizmet` database described in the other documents in this folder, so what
you learn here is exactly what you need to read the API code.

> [!NOTE]
> The database is **PostgreSQL**. Most of Part 1–2 works in any SQL database;
> Part 3–5 uses PostgreSQL-specific features (`FOR UPDATE`, `jsonb`, `RETURNING`,
> `ON CONFLICT`, …).

## Contents

| Part | Topic                                                                                      | Level             |
| ---- | ------------------------------------------------------------------------------------------ | ----------------- |
| 0    | [Before you start](#part-0--before-you-start)                                              | Absolute beginner |
| 1    | [Reading data](#part-1--reading-data-select)                                               | Beginner          |
| 2    | [Changing data](#part-2--changing-data-insert-update-delete)                               | Beginner          |
| 3    | [Combining tables (joins)](#part-3--combining-tables-joins)                                | Beginner+         |
| 4    | [Summarising data](#part-4--summarising-data-aggregation)                                  | Intermediate      |
| 5    | [Subqueries and CTEs](#part-5--subqueries-and-ctes)                                        | Intermediate      |
| 6    | [Window functions](#part-6--window-functions)                                              | Advanced          |
| 7    | [Transactions, locks, idempotency](#part-7--transactions-locks-and-idempotency)            | Professional      |
| 8    | [JSON, triggers, constraints](#part-8--json-triggers-and-constraints)                      | Professional      |
| 9    | [Performance](#part-9--performance-indexes-and-explain)                                    | Professional      |
| 10   | [Walkthrough of the project's real queries](#part-10--the-projects-real-queries-explained) | Professional      |
| 11   | [Cheat sheet and common mistakes](#part-11--cheat-sheet-and-common-mistakes)               | All               |

---

## Part 0 — Before you start

### What is a database, a table, a row, a column?

Think of a spreadsheet:

| Spreadsheet word | SQL word | Example in this project                |
| ---------------- | -------- | -------------------------------------- |
| Workbook         | Database | `hizmet`                               |
| Folder of sheets | Schema   | `core`, `wallet`, `canteen`, `laundry` |
| Sheet            | Table    | `core.user_profile`                    |
| A line           | Row      | one person                             |
| A column header  | Column   | `first_name`, `phone_e164`             |

A table is written `schema.table`, for example `wallet.account`.

### SQL in one sentence

SQL is a language where you **describe what you want** ("all active users sorted
by name") and the database figures out how to get it.

Statements end with a semicolon `;`. Keywords are case-insensitive
(`select` = `SELECT`), but by convention they are written in capitals. Text values
use **single quotes** (`'Ali'`); double quotes are for identifiers.

```sql
-- Two dashes start a comment.
/* This is a
   multi-line comment. */
```

### How to run the examples

1. Use a **local development database only**, never production.
2. Connect with any PostgreSQL client (`psql`, DBeaver, TablePlus…) to the
   `hizmet` database. See [`docs/docker`](../docker/README.md) for starting the
   local database.
3. Run the practice data below **inside a transaction**, so you can throw
   everything away afterwards with `ROLLBACK;`.

### Practice data

Money is stored in **kuruş** (`_minor` columns): `1500` = 15.00 TRY, and catalog
prices must be whole lira (multiples of 100).

```sql
BEGIN;

-- 3 people. The trigger create_wallet_account_after_user also creates
-- one wallet.account row for each of them automatically.
INSERT INTO core.user_profile (keycloak_subject, phone_e164, first_name, last_name)
VALUES
  (gen_random_uuid(), '+905550000001', 'Ali',    'Yilmaz'),
  (gen_random_uuid(), '+905550000002', 'Ayse',   'Kaya'),
  (gen_random_uuid(), '+905550000003', 'Mehmet', 'Demir');

-- Ali deposits 500 TRY, Ayse deposits 200 TRY: write the journal ...
INSERT INTO wallet.ledger_entry (account_id, entry_type, available_delta_minor, idempotency_key)
SELECT a.id, 'CASH_DEPOSIT', 50000, 'practice-deposit-ali'
FROM wallet.account a JOIN core.user_profile p ON p.id = a.user_profile_id
WHERE p.phone_e164 = '+905550000001';

INSERT INTO wallet.ledger_entry (account_id, entry_type, available_delta_minor, idempotency_key)
SELECT a.id, 'CASH_DEPOSIT', 20000, 'practice-deposit-ayse'
FROM wallet.account a JOIN core.user_profile p ON p.id = a.user_profile_id
WHERE p.phone_e164 = '+905550000002';

-- ... and update the cached balance (the API always does both together).
UPDATE wallet.account SET available_minor = 50000
WHERE user_profile_id = (SELECT id FROM core.user_profile WHERE phone_e164 = '+905550000001');
UPDATE wallet.account SET available_minor = 20000
WHERE user_profile_id = (SELECT id FROM core.user_profile WHERE phone_e164 = '+905550000002');

-- 3 products in the main canteen.
INSERT INTO canteen.product (canteen_id, name, name_key, price_minor, stock_on_hand)
SELECT s.id, v.name, lower(v.name), v.price, v.stock
FROM canteen.store s
JOIN core.service_unit su ON su.id = s.service_unit_id AND su.code = 'canteen-main'
CROSS JOIN (VALUES ('Tost', 3000, 20), ('Ayran', 1000, 50), ('Cay', 500, 0)) AS v(name, price, stock);

-- Stay inside the transaction while you practise.
-- When you are done:  ROLLBACK;
```

If you see an error, run `ROLLBACK;` and start again. Anything that breaks a rule
(for example a negative price) is **refused by the database**. That is the point of
the constraints described in the table documents.

---

## Part 1 — Reading data (`SELECT`)

### 1.1 `SELECT … FROM` — pick columns from a table

```sql
SELECT first_name, last_name FROM core.user_profile;
```

| first_name | last_name |
| ---------- | --------- |
| Ali        | Yilmaz    |
| Ayse       | Kaya      |
| Mehmet     | Demir     |

`SELECT *` returns **every** column. It is fine for exploring but avoid it in
application code (it fetches data you do not need and breaks when columns change).

### 1.2 `AS` — give a column a nicer name (alias)

```sql
SELECT first_name AS name, available_minor / 100.0 AS balance_try
FROM core.user_profile p
JOIN wallet.account a ON a.user_profile_id = p.id;
```

`p` and `a` are **table aliases**, short names you can use for the rest of the query.

### 1.3 `WHERE` — keep only some rows

```sql
SELECT * FROM canteen.product WHERE price_minor >= 1000;
```

| Operator                  | Meaning                                             | Example                            |
| ------------------------- | --------------------------------------------------- | ---------------------------------- |
| `=`, `<>` (or `!=`)       | equal, not equal                                    | `status = 'ACTIVE'`                |
| `<`, `<=`, `>`, `>=`      | comparisons                                         | `stock_on_hand > 0`                |
| `AND`, `OR`, `NOT`        | combine conditions                                  | `listed AND stock_on_hand > 0`     |
| `IN (…)`                  | one of several values                               | `status IN ('PLACED','READY')`     |
| `BETWEEN a AND b`         | inclusive range                                     | `price_minor BETWEEN 500 AND 3000` |
| `LIKE 'Al%'` / `ILIKE`    | text pattern (`%` = any text); `ILIKE` ignores case | `first_name ILIKE 'a%'`            |
| `IS NULL` / `IS NOT NULL` | missing / present value                             | `archived_at IS NULL`              |

> [!WARNING]
> `NULL` means **"unknown / no value"**, not zero or empty text. `x = NULL` is
> never true. Always write `x IS NULL`. This is why the project writes
> `deleted_at IS NULL` to mean "not deleted".

### 1.4 `ORDER BY` — sort

```sql
SELECT name, price_minor FROM canteen.product ORDER BY price_minor DESC, name;
```

`ASC` (default) = small to large, `DESC` = large to small. You can sort by several
columns; the second is used only to break ties in the first.

### 1.5 `LIMIT` and `OFFSET` — take a slice

```sql
SELECT * FROM canteen.product ORDER BY name LIMIT 2;           -- first 2
SELECT * FROM canteen.product ORDER BY name LIMIT 2 OFFSET 2;  -- next 2
```

Always combine `LIMIT` with `ORDER BY`, otherwise "first" is meaningless. The
project does this: order lists end with `ORDER BY … LIMIT 100`.

### 1.6 `DISTINCT` — remove duplicates

```sql
SELECT DISTINCT status FROM core.user_profile;
```

### 1.7 Calculations and text helpers

```sql
SELECT
  name,
  price_minor / 100.0                  AS price_try,   -- arithmetic
  upper(name)                          AS shouting,    -- text functions
  concat_ws(' ', 'Ali', 'Yilmaz')      AS full_name,   -- join text with a separator
  now()                                AS current_moment
FROM canteen.product;
```

`concat_ws(' ', a, b)` joins texts with a space and silently **skips NULLs**. The
API uses it for every "full name" it returns.

### 1.8 `CASE` — if / else inside a query

```sql
SELECT name,
       CASE
         WHEN stock_on_hand = 0  THEN 'Out of stock'
         WHEN stock_on_hand < 10 THEN 'Low'
         ELSE 'OK'
       END AS stock_level
FROM canteen.product;
```

### 1.9 `COALESCE` — replace NULL with a default

```sql
SELECT name, COALESCE(archived_at::text, 'still on sale') AS archived
FROM canteen.product;
```

`COALESCE(a, b, c)` returns the first value that is not NULL.

### Exercises

1. List the phone numbers of all `ACTIVE` users, sorted alphabetically by last name.
2. Show products that are in stock (`stock_on_hand > 0`) with the price in lira.
3. Show the 2 most expensive products.

<details>
<summary>Answers</summary>

```sql
-- 1
SELECT phone_e164 FROM core.user_profile WHERE status = 'ACTIVE' ORDER BY last_name;
-- 2
SELECT name, price_minor / 100.0 AS price_try FROM canteen.product WHERE stock_on_hand > 0;
-- 3
SELECT name FROM canteen.product ORDER BY price_minor DESC LIMIT 2;
```

</details>

---

## Part 2 — Changing data (`INSERT`, `UPDATE`, `DELETE`)

### 2.1 `INSERT` — add rows

```sql
INSERT INTO canteen.product (canteen_id, name, name_key, price_minor, stock_on_hand)
VALUES ('<store id>', 'Simit', 'simit', 1000, 30);
```

List the columns, then the values **in the same order**. Columns you leave out
get their `DEFAULT` (for example `id` is generated, `created_at` is `now()`).

### 2.2 `RETURNING` — get the new row back (PostgreSQL)

```sql
INSERT INTO core.user_profile (keycloak_subject, phone_e164, first_name, last_name)
VALUES (gen_random_uuid(), '+905550000004', 'Zeynep', 'Aydin')
RETURNING id, created_at;
```

The API uses `RETURNING id` after almost every insert so it does not need a second
query to find out which id was generated.

### 2.3 `UPDATE` — change existing rows

```sql
UPDATE canteen.product
SET price_minor = 3500, updated_at = now()
WHERE name = 'Tost';
```

> [!CAUTION]
> **An `UPDATE` or `DELETE` without `WHERE` changes EVERY row.** Habit to build:
> write the `WHERE` first, run it as a `SELECT` to see which rows it matches, and
> only then turn it into an `UPDATE`.

Calculated updates refer to the column's old value:

```sql
UPDATE wallet.account SET available_minor = available_minor + 5000 WHERE id = $1;
```

### 2.4 `DELETE` — remove rows

```sql
DELETE FROM tea_cafe.brew WHERE deleted_at IS NULL AND started_at <= now() - INTERVAL '10 hours';
```

This is real project code: it cleans up brews older than ten hours.

> [!NOTE]
> Most business data in this project is **never** deleted. Instead it is
> "soft-deleted" by setting `archived_at` / `deleted_at`, and history tables
> (`*_event`, `wallet.ledger_entry`) reject `UPDATE` and `DELETE` completely.

### 2.5 `$1`, `$2` — parameters

In the application code you will see `WHERE id = $1`. These are **placeholders**.
The values are sent separately (`[orderId]`), never glued into the text. This
protects against **SQL injection** and lets PostgreSQL reuse the plan.

```sql
-- NEVER build SQL like this:  "... WHERE name = '" + userInput + "'"
-- ALWAYS:                      "... WHERE name = $1"   with values ['Tost']
```

---

## Part 3 — Combining tables (joins)

Related data lives in different tables. A **join** lines rows up using a shared
value, usually _foreign key = primary key_.

```text
wallet.account.user_profile_id  =  core.user_profile.id
```

### 3.1 `INNER JOIN` — only rows that match on both sides

```sql
SELECT p.first_name, a.available_minor
FROM core.user_profile AS p
JOIN wallet.account    AS a ON a.user_profile_id = p.id;
```

(`JOIN` alone means `INNER JOIN`.) A user without a wallet account would not
appear.

### 3.2 `LEFT JOIN` — keep every left row, `NULL` when there is no match

```sql
SELECT p.first_name, COUNT(o.id) AS orders
FROM core.user_profile p
LEFT JOIN canteen.customer_order o ON o.customer_user_profile_id = p.id
GROUP BY p.id;
```

Users who never ordered still appear with `0`. With `INNER JOIN` they would vanish.

Typical use, finding rows **without** a partner:

```sql
SELECT p.first_name
FROM core.user_profile p
LEFT JOIN canteen.customer_order o ON o.customer_user_profile_id = p.id
WHERE o.id IS NULL;          -- never placed an order
```

### 3.3 Joining many tables

```sql
SELECT p.first_name, o.status, i.product_name, i.quantity, i.line_total_minor
FROM canteen.customer_order o
JOIN core.user_profile  p ON p.id = o.customer_user_profile_id
JOIN canteen.order_item i ON i.order_id = o.id;
```

Read it like a path: _order → who placed it → what was in it_. The ER diagrams show
which columns to join on.

### 3.4 Joining a table to itself

`wallet.ledger_entry.reversal_of_entry_id` points to another row of the same
table. Give the table two aliases to use both sides:

```sql
SELECT original.id AS deposit_id,
       reversal.id AS reversed_by          -- NULL while not reversed
FROM wallet.ledger_entry original
LEFT JOIN wallet.ledger_entry reversal ON reversal.reversal_of_entry_id = original.id
WHERE original.entry_type = 'CASH_DEPOSIT';
```

### Join cheat sheet

| Join         | Keeps                              | Typical use                       |
| ------------ | ---------------------------------- | --------------------------------- |
| `INNER JOIN` | only matching pairs                | "give me orders with their users" |
| `LEFT JOIN`  | all left rows, right may be `NULL` | "users and their orders, if any"  |
| `RIGHT JOIN` | all right rows (rarely used)       | same as LEFT with sides swapped   |
| `FULL JOIN`  | everything from both sides         | comparing two lists               |
| `CROSS JOIN` | every combination                  | generating combinations           |

---

## Part 4 — Summarising data (aggregation)

### 4.1 Aggregate functions

| Function      | Returns                                |
| ------------- | -------------------------------------- |
| `COUNT(*)`    | number of rows                         |
| `COUNT(col)`  | number of rows where `col` is not NULL |
| `SUM(col)`    | total                                  |
| `AVG(col)`    | average                                |
| `MIN` / `MAX` | smallest / largest                     |

```sql
SELECT COUNT(*) AS products, SUM(stock_on_hand) AS pieces, MAX(price_minor) AS most_expensive
FROM canteen.product;
```

### 4.2 `GROUP BY` — one result row per group

```sql
SELECT status, COUNT(*) AS orders, SUM(total_minor) / 100.0 AS revenue_try
FROM canteen.customer_order
GROUP BY status;
```

**Rule:** every selected column must either be in `GROUP BY` or inside an
aggregate function.

### 4.3 `HAVING` — filter groups (after grouping)

```sql
SELECT customer_user_profile_id, COUNT(*) AS orders
FROM canteen.customer_order
GROUP BY customer_user_profile_id
HAVING COUNT(*) >= 3;
```

|                    | `WHERE`             | `HAVING`           |
| ------------------ | ------------------- | ------------------ |
| Filters            | individual rows     | whole groups       |
| Runs               | **before** grouping | **after** grouping |
| Can use aggregates | no                  | yes                |

### 4.4 `FILTER` — several conditional totals in one pass (PostgreSQL)

```sql
SELECT
  COUNT(*)                                        AS all_orders,
  COUNT(*) FILTER (WHERE status = 'PLACED')       AS waiting,
  COUNT(*) FILTER (WHERE status LIKE 'CANCELLED%') AS cancelled
FROM canteen.customer_order;
```

### 4.5 Grouping by time

```sql
SELECT date_trunc('day', created_at) AS day, SUM(total_minor) / 100.0 AS revenue_try
FROM canteen.customer_order
WHERE status = 'DELIVERED'
GROUP BY 1                       -- 1 = the first selected column
ORDER BY 1;
```

### 4.6 Order of execution

SQL is **written** in one order and **evaluated** in another. This explains most
"why can't I use that here?" errors.

| Step | Clause          | What happens                                     |
| ---- | --------------- | ------------------------------------------------ |
| 1    | `FROM` / `JOIN` | build the working set of rows                    |
| 2    | `WHERE`         | drop rows                                        |
| 3    | `GROUP BY`      | form groups                                      |
| 4    | `HAVING`        | drop groups                                      |
| 5    | `SELECT`        | compute the output columns (aliases appear here) |
| 6    | `ORDER BY`      | sort (can use aliases)                           |
| 7    | `LIMIT`         | cut                                              |

---

## Part 5 — Subqueries and CTEs

### 5.1 Subquery — a query inside a query

**Scalar** (returns one value):

```sql
SELECT name, price_minor
FROM canteen.product
WHERE price_minor > (SELECT AVG(price_minor) FROM canteen.product);
```

**List** (used with `IN`):

```sql
SELECT first_name FROM core.user_profile
WHERE id IN (SELECT customer_user_profile_id FROM canteen.customer_order WHERE status = 'DELIVERED');
```

**`EXISTS`** (is there at least one matching row? usually faster than `IN`):

```sql
SELECT p.first_name
FROM core.user_profile p
WHERE NOT EXISTS (
  SELECT 1 FROM canteen.customer_order o WHERE o.customer_user_profile_id = p.id
);
```

**Correlated** (the inner query refers to the outer row, so it runs once per row).
The laundry code uses this to attach each load's runs:

```sql
SELECT l.id,
       (SELECT COUNT(*) FROM laundry.machine_run r WHERE r.load_id = l.id) AS run_count
FROM laundry.load l;
```

### 5.2 CTE — `WITH`, a named step

A **Common Table Expression** is a temporary named result you can reuse. It turns
a nested, hard-to-read query into steps that read top to bottom.

```sql
WITH spend AS (                      -- step 1: spend per customer
  SELECT customer_user_profile_id AS user_id, SUM(total_minor) AS total
  FROM canteen.customer_order
  WHERE status = 'DELIVERED'
  GROUP BY customer_user_profile_id
)
SELECT p.first_name, s.total / 100.0 AS spent_try      -- step 2: add names
FROM spend s
JOIN core.user_profile p ON p.id = s.user_id
ORDER BY s.total DESC;
```

### 5.3 Set operations

```sql
SELECT phone_e164 FROM core.user_profile
UNION                      -- combine, remove duplicates (UNION ALL keeps them)
SELECT '+900000000000';

-- INTERSECT = in both queries, EXCEPT = in the first but not the second
```

### 5.4 `DISTINCT ON` — "the latest row per group" (PostgreSQL)

```sql
SELECT DISTINCT ON (order_id) order_id, to_status, created_at
FROM canteen.order_event
ORDER BY order_id, created_at DESC;      -- the newest event of every order
```

---

## Part 6 — Window functions

An aggregate with `GROUP BY` **collapses** rows. A window function adds a
calculation **next to** each row without collapsing them. The syntax is
`function(...) OVER (PARTITION BY … ORDER BY …)`.

### 6.1 Running balance of a wallet

```sql
SELECT created_at,
       entry_type,
       available_delta_minor,
       SUM(available_delta_minor) OVER (ORDER BY created_at, id) AS balance_after
FROM wallet.ledger_entry
WHERE account_id = $1
ORDER BY created_at, id;
```

| entry_type       | delta  | balance_after |
| ---------------- | ------ | ------------- |
| `CASH_DEPOSIT`   | +50000 | 50000         |
| `HOLD`           | -3000  | 47000         |
| `SERVICE_REFUND` | +3000  | 50000         |

### 6.2 `PARTITION BY` — a separate window per group

```sql
SELECT customer_user_profile_id, id, total_minor,
       SUM(total_minor) OVER (PARTITION BY customer_user_profile_id) AS customer_total,
       ROW_NUMBER()     OVER (PARTITION BY customer_user_profile_id ORDER BY created_at DESC) AS nth_latest
FROM canteen.customer_order;
```

### 6.3 Ranking functions

| Function       | Behaviour with ties (equal values) |
| -------------- | ---------------------------------- |
| `ROW_NUMBER()` | 1, 2, 3, 4 (always unique)         |
| `RANK()`       | 1, 2, 2, 4 (gaps after ties)       |
| `DENSE_RANK()` | 1, 2, 2, 3 (no gaps)               |

### 6.4 "Top N per group"

```sql
SELECT * FROM (
  SELECT o.*,
         ROW_NUMBER() OVER (PARTITION BY customer_user_profile_id ORDER BY created_at DESC) AS rn
  FROM canteen.customer_order o
) ranked
WHERE rn <= 3;                           -- the 3 latest orders of every customer
```

### 6.5 `LAG` / `LEAD` — look at the previous / next row

```sql
SELECT id, event_type, created_at,
       created_at - LAG(created_at) OVER (PARTITION BY load_id ORDER BY created_at) AS since_previous_event
FROM laundry.load_event;
```

---

## Part 7 — Transactions, locks and idempotency

This is the part that makes a money-handling system **correct**. Almost every
write in the API follows the pattern below.

### 7.1 Transactions: all or nothing

```sql
BEGIN;
  INSERT INTO wallet.ledger_entry (...) VALUES (...);   -- 1
  UPDATE wallet.account SET available_minor = available_minor - 3000 WHERE id = $1;   -- 2
COMMIT;      -- both become permanent together
-- or ROLLBACK;  -- neither happened
```

If step 2 fails, step 1 is undone automatically. Without a transaction the ledger
and the balance could disagree. In the code this is
`this.postgres.withTransaction(async (client) => { … })`.

**ACID** in plain words:

| Letter | Meaning     | Everyday version                                               |
| ------ | ----------- | -------------------------------------------------------------- |
| A      | Atomicity   | all steps happen, or none                                      |
| C      | Consistency | constraints (`CHECK`, `FK`, `UNIQUE`) are never violated       |
| I      | Isolation   | concurrent transactions do not see each other's half-done work |
| D      | Durability  | after `COMMIT` the data survives a crash                       |

### 7.2 The race condition problem

Two requests spend from the same wallet at the same moment (balance 30 TRY, each
wants 20 TRY):

| Time | Request A           | Request B           |
| ---- | ------------------- | ------------------- |
| 1    | reads balance = 30  |                     |
| 2    |                     | reads balance = 30  |
| 3    | 30 ≥ 20 → writes 10 |                     |
| 4    |                     | 30 ≥ 20 → writes 10 |

Both succeeded, the user spent 40 TRY of 30. This is a **lost update**.

### 7.3 The fix: `SELECT … FOR UPDATE` (row lock)

```sql
SELECT id, available_minor
FROM wallet.account
WHERE user_profile_id = $1
FOR UPDATE;                      -- other transactions wanting this row must WAIT
```

| Time | Request A                                | Request B                                   |
| ---- | ---------------------------------------- | ------------------------------------------- |
| 1    | `FOR UPDATE` → gets the lock, balance 30 |                                             |
| 2    |                                          | `FOR UPDATE` → **waits**                    |
| 3    | writes 10, `COMMIT` (lock released)      |                                             |
| 4    |                                          | now reads balance = **10** → "insufficient" |

The lock lives until `COMMIT`/`ROLLBACK`. The project uses it in
[`wallet.repository.ts`](../../apps/api/src/modules/wallet/wallet.repository.ts)
(`lockAccountByProfileId`, `lockDeposit`) and in the canteen and laundry
repositories.

Lock variants you will meet:

| Clause                  | Meaning                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `FOR UPDATE`            | exclusive: I will change this row, everyone else waits                                  |
| `FOR UPDATE OF account` | lock only the rows of table alias `account` in a join                                   |
| `FOR SHARE`             | shared: nobody may change it while I read, but other readers are fine (`lockMainStore`) |

### 7.4 Locking in a fixed order avoids deadlocks

A **deadlock** is when A waits for B and B waits for A. The product query locks
many rows at once, always sorted the same way:

```sql
SELECT id, price_minor, stock_on_hand
FROM canteen.product
WHERE canteen_id = $1 AND id = ANY($2::uuid[])
ORDER BY id                       -- every transaction locks in the same order
FOR UPDATE;
```

`ANY($2::uuid[])` means "id equals any value of this array parameter", a compact
replacement for a long `IN (…)` list.

### 7.5 Idempotency: a retried request must not pay twice

Networks fail and clients retry. Each money-changing request carries an
`idempotency_key` and the column is `UNIQUE`:

```sql
-- first attempt: inserted
-- second attempt with the same key: the database rejects it (unique violation)
INSERT INTO wallet.ledger_entry (..., idempotency_key) VALUES (..., 'service:canteen-main:hold:abc12345');
```

The API checks first with `findEntryByIdempotencyKey`:

```sql
SELECT id, account_id, entry_type, available_delta_minor::text
FROM wallet.ledger_entry
WHERE idempotency_key = $1;
```

- **Found and identical** → return the earlier result (`duplicate: true`).
- **Found but different** → error `IDEMPOTENCY_CONFLICT`.
- **Not found** → do the work.

The `UNIQUE` constraint is the final safety net even if two identical requests
arrive at exactly the same time.

### 7.6 `ON CONFLICT` — "insert, but if it exists, do something else"

```sql
INSERT INTO wallet.account (user_profile_id)
VALUES ($1)
ON CONFLICT (user_profile_id) DO NOTHING;
```

This is inside the project's trigger function. `DO NOTHING` skips silently;
`DO UPDATE SET …` would turn the insert into an update ("upsert").

### 7.7 Atomic arithmetic

Always let the database compute from the current value:

```sql
UPDATE wallet.account SET available_minor = available_minor - $2 WHERE id = $1;   -- good
-- bad: read the balance in code, subtract there, write the result back
```

Together with `CHECK (available_minor >= 0)` the database itself refuses to go
negative.

---

## Part 8 — JSON, triggers and constraints

### 8.1 Building JSON in SQL

The API returns an order with all its lines as a JSON array **from one query**:

```sql
SELECT o.id,
       json_agg(
         json_build_object(
           'productName', i.product_name,
           'quantity',    i.quantity
         ) ORDER BY i.product_name
       ) AS items
FROM canteen.customer_order o
JOIN canteen.order_item i ON i.order_id = o.id
GROUP BY o.id;
```

| Function                        | Does                                     |
| ------------------------------- | ---------------------------------------- |
| `json_build_object(k, v, …)`    | builds one JSON object                   |
| `json_agg(x)` / `jsonb_agg(x)`  | collects many rows into one JSON array   |
| `'[]'::jsonb`                   | an empty JSON array literal              |
| `::text`, `::uuid`, `::integer` | convert a value to another type ("cast") |

The laundry query uses a **scalar subquery per child table** instead of a join, to
avoid the "two child tables multiply each other's rows" trap:

```sql
SELECT l.id,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status)
                                  ORDER BY r.started_at)
                 FROM laundry.machine_run r WHERE r.load_id = l.id), '[]'::jsonb) AS runs,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('type', e.event_type)
                                  ORDER BY e.created_at)
                 FROM laundry.load_event e WHERE e.load_id = l.id), '[]'::jsonb) AS events
FROM laundry.load l;
```

`COALESCE(..., '[]')` is needed because `jsonb_agg` over zero rows returns `NULL`.

> [!TIP]
> If you joined `machine_run` **and** `load_event` to `load` and then grouped, a load
> with 2 runs and 5 events would produce 10 rows and wrong totals. Aggregating each
> child in its own subquery avoids it.

### 8.2 Why `::text` on money columns?

`bigint` can exceed what JavaScript numbers hold exactly. The code selects
`available_minor::text` and converts it with `BigInt(...)` in TypeScript, so no
precision is lost.

### 8.3 Constraints: rules the database enforces

| Constraint    | Meaning                           | Example in this project                     |
| ------------- | --------------------------------- | ------------------------------------------- |
| `PRIMARY KEY` | unique, not null row identity     | `id uuid`                                   |
| `FOREIGN KEY` | value must exist in another table | `ledger_entry.account_id → account.id`      |
| `UNIQUE`      | no two rows share the value       | `phone_e164`, `idempotency_key`             |
| `NOT NULL`    | a value is required               | `first_name`                                |
| `CHECK (…)`   | a custom rule on the row          | `price_minor > 0 AND price_minor % 100 = 0` |
| `DEFAULT`     | value used when none is given     | `created_at DEFAULT now()`                  |

Try one: `INSERT INTO canteen.product (…, price_minor) VALUES (…, 150)` fails
because 150 is not a whole lira.

### 8.4 Triggers: code that runs automatically

A trigger runs a function **in response to** `INSERT`/`UPDATE`/`DELETE`. This
project has two kinds.

**1. Creating the wallet automatically**

```sql
CREATE OR REPLACE FUNCTION wallet.create_account_for_user()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO wallet.account (user_profile_id) VALUES (NEW.id)
  ON CONFLICT (user_profile_id) DO NOTHING;
  RETURN NEW;                       -- NEW = the row that was just inserted
END;
$$;

CREATE TRIGGER create_wallet_account_after_user
AFTER INSERT ON core.user_profile
FOR EACH ROW EXECUTE FUNCTION wallet.create_account_for_user();
```

**2. Making history untouchable**

```sql
CREATE FUNCTION wallet.reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'wallet ledger entries are immutable';
END; $$;

CREATE TRIGGER ledger_entry_immutable
BEFORE UPDATE OR DELETE ON wallet.ledger_entry
FOR EACH ROW EXECUTE FUNCTION wallet.reject_ledger_mutation();
```

Try `UPDATE wallet.ledger_entry SET reason = 'x';` and you will get the exception.
Even a bug in the API cannot rewrite financial history.

| Trigger part       | Meaning                                          |
| ------------------ | ------------------------------------------------ |
| `BEFORE` / `AFTER` | run before the change (can block it) or after it |
| `FOR EACH ROW`     | once per affected row                            |
| `NEW` / `OLD`      | the row after / before the change                |
| `RAISE EXCEPTION`  | abort the statement with an error                |

### 8.5 Partial and unique indexes as business rules

```sql
-- At most one wash/dry machine slot can hold a load at a time:
CREATE UNIQUE INDEX laundry_active_machine_idx
  ON laundry.machine_run (machine_type, machine_number)
  WHERE status = 'IN_MACHINE';
```

A **partial unique index** is unique only for rows matching its `WHERE`. Removed
runs are ignored, so history can repeat the same machine, but two _active_ runs on
one machine are impossible. The rule is enforced even if two operators click at the
same time.

---

## Part 9 — Performance: indexes and `EXPLAIN`

### 9.1 What an index is

An index is like a book's index: instead of reading every page (a **sequential
scan**) the database jumps straight to the right rows.

```sql
CREATE INDEX ledger_entry_account_created_idx
  ON wallet.ledger_entry (account_id, created_at DESC, id DESC);
```

This makes "show this account's newest entries" instant, because the rows are
already stored in that order.

**Column order matters.** An index on `(a, b)` helps filters on `a` or on `a` and
`b`, but not on `b` alone.

### 9.2 Seeing what the database does: `EXPLAIN`

```sql
EXPLAIN ANALYZE
SELECT * FROM wallet.ledger_entry WHERE account_id = '…' ORDER BY created_at DESC LIMIT 20;
```

| You see         | Meaning                                                |
| --------------- | ------------------------------------------------------ |
| `Seq Scan`      | read the whole table (OK for tiny tables, bad for big) |
| `Index Scan`    | used an index                                          |
| `actual time=…` | real milliseconds (only with `ANALYZE`)                |
| `rows=…`        | rows produced                                          |

> [!WARNING]
> `EXPLAIN ANALYZE` **really executes** the statement. Wrap `UPDATE`/`DELETE` in
> `BEGIN; … ROLLBACK;`.

### 9.3 Habits that keep queries fast

- Select only the columns you need.
- Filter on indexed columns, and do not wrap them in functions
  (`WHERE date_trunc('day', created_at) = …` cannot use an index on `created_at`;
  write `created_at >= … AND created_at < …`).
- Always `LIMIT` list endpoints (the project caps order lists at 100).
- Prefer `EXISTS` over `IN` for large subqueries.
- Avoid `OFFSET` for deep pages; use "keyset pagination"
  (`WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT 20`).

---

## Part 10 — The project's real queries, explained

Each section shows a query taken from the API (simplified) and explains it line by
line. Open the linked file to see it in context.

### 10.1 Look up the signed-in user

[`user-profile.repository.ts`](../../apps/api/src/modules/core/user-profile.repository.ts)

```sql
SELECT id, first_name, status
FROM core.user_profile
WHERE keycloak_subject = $1;
```

`keycloak_subject` is the `sub` claim of the login token, and it is `UNIQUE`, so at
most one row comes back. Services also add `AND status = 'ACTIVE'` so suspended
users cannot act.

### 10.2 Create a user (and get the id back)

```sql
INSERT INTO core.user_profile (keycloak_subject, phone_e164, first_name, last_name, status)
VALUES ($1, $2, $3, $4, 'ACTIVE')
RETURNING id, keycloak_subject, phone_e164, first_name, last_name, status, created_at, updated_at;
```

Behind the scenes the trigger from §8.4 creates the wallet. The `CHECK` on
`phone_e164` rejects anything that is not E.164.

### 10.3 Cash deposit

[`wallet.repository.ts`](../../apps/api/src/modules/wallet/wallet.repository.ts) — `depositCash`

Inside one transaction:

```sql
-- 1. lock the account (join, but lock only the account row)
SELECT account.id AS account_id, profile.id AS user_profile_id, account.available_minor::text
FROM core.user_profile AS profile
JOIN wallet.account AS account ON account.user_profile_id = profile.id
WHERE profile.phone_e164 = $1
FOR UPDATE OF account;

-- 2. was this request already processed?
SELECT id FROM wallet.ledger_entry WHERE idempotency_key = $1;

-- 3. journal entry
INSERT INTO wallet.ledger_entry (account_id, entry_type, available_delta_minor, idempotency_key, actor_user_profile_id)
VALUES ($1, 'CASH_DEPOSIT', $2, $3, $4)
RETURNING id;

-- 4. cached balance
UPDATE wallet.account SET available_minor = available_minor + $2, updated_at = now() WHERE id = $1;
```

Concepts used: join, row lock, idempotency key, `RETURNING`, atomic arithmetic,
transaction.

### 10.4 Reversing a deposit

```sql
SELECT account.id AS account_id, original.id AS entry_id, original.entry_type,
       original.available_delta_minor::text AS deposit_amount_minor,
       reversal.id AS reversed_by_entry_id
FROM wallet.ledger_entry AS original
JOIN wallet.account AS account ON account.id = original.account_id
LEFT JOIN wallet.ledger_entry AS reversal ON reversal.reversal_of_entry_id = original.id
WHERE original.id = $1
FOR UPDATE OF account, original;
```

- **Self-join** with `LEFT JOIN`: `reversed_by_entry_id` is `NULL` if nobody
  reversed it yet.
- The code then checks: still a `CASH_DEPOSIT`? not already reversed? enough
  `available_minor` to take back? and inserts a `CASH_DEPOSIT_REVERSAL` with a
  negative amount and `reversal_of_entry_id`.
- `reversal_of_entry_id` is `UNIQUE`, so even a race cannot reverse it twice.

> Entries are never edited. A correction is a **new** row that cancels the old one.
> This is how accounting ledgers work.

### 10.5 Charging a service (HOLD then CAPTURE)

`chargeServiceInTransaction`, used by canteen orders and laundry runs.

```sql
-- HOLD: move money from available to held
INSERT INTO wallet.ledger_entry (account_id, entry_type, available_delta_minor, held_delta_minor,
                                 idempotency_key, actor_user_profile_id, service_code, reference_id)
VALUES ($1, 'HOLD', -3000, 3000, 'service:canteen-main:hold:<key>', $2, 'canteen-main', $3);
UPDATE wallet.account SET available_minor = available_minor - 3000,
                          held_minor      = held_minor      + 3000 WHERE id = $1;

-- CAPTURE: consume the held money
INSERT INTO wallet.ledger_entry (..., entry_type, available_delta_minor, held_delta_minor, ...)
VALUES (..., 'CAPTURE', 0, -3000, ...);
UPDATE wallet.account SET held_minor = held_minor - 3000 WHERE id = $1;
```

The two idempotency keys are derived from one request key
(`…:hold:<key>`, `…:capture:<key>`), so a retry finds both and returns the earlier
result. The table-level `CHECK` guarantees the signs make sense (`HOLD` must be
negative-available / positive-held, etc.).

### 10.6 Placing a canteen order

[`canteen-order.repository.ts`](../../apps/api/src/modules/canteen/canteen-order.repository.ts)

Step by step, all in one transaction:

```sql
-- a. lock the customer's wallet
SELECT profile.id AS profile_id, account.id AS account_id, account.available_minor::text
FROM core.user_profile profile
JOIN wallet.account account ON account.user_profile_id = profile.id
WHERE profile.keycloak_subject = $1 AND profile.status = 'ACTIVE'
FOR UPDATE OF account;

-- b. find the customer-visible main store (shared lock: settings must not change mid-order)
SELECT store.id, store.ordering_enabled
FROM canteen.store store
JOIN core.service_unit service ON service.id = store.service_unit_id
WHERE service.code = 'canteen-main' AND store.customer_visible AND service.active
FOR SHARE OF store;

-- c. lock every product in the cart in a stable order
SELECT id, name, price_minor::text, stock_on_hand::text, listed, archived_at
FROM canteen.product
WHERE canteen_id = $1 AND id = ANY($2::uuid[])
ORDER BY id
FOR UPDATE;

-- d. insert the order header, then one row per line with NAME and PRICE SNAPSHOTS
INSERT INTO canteen.customer_order (canteen_id, customer_user_profile_id, total_minor, idempotency_key)
VALUES ($1, $2, $3, $4) RETURNING id;

INSERT INTO canteen.order_item (order_id, product_id, product_name, unit_price_minor, quantity, line_total_minor)
VALUES ($1, $2, $3, $4, $5, $6);

-- e. reduce stock
UPDATE canteen.product SET stock_on_hand = stock_on_hand - $2, updated_at = now() WHERE id = $1;

-- f. charge the wallet (HOLD + CAPTURE, see 10.5), then write the first order_event
INSERT INTO canteen.order_event (order_id, from_status, to_status, actor_user_profile_id)
VALUES ($1, NULL, 'PLACED', $2);
```

What protects the data: the row locks stop two customers buying the last item;
`CHECK (stock_on_hand >= 0)` is the safety net; the transaction makes the order,
stock change and payment succeed or fail together.

### 10.7 Cancelling and refunding

```sql
UPDATE canteen.product SET stock_on_hand = stock_on_hand + $2 WHERE id = $1;   -- put stock back
INSERT INTO wallet.ledger_entry (..., entry_type, ...) VALUES (..., 'SERVICE_REFUND', ...);
UPDATE wallet.account SET available_minor = available_minor + $2 WHERE id = $1;
UPDATE canteen.customer_order SET status = $2, updated_at = now() WHERE id = $1;
INSERT INTO canteen.order_event (...) VALUES (...);
```

Before this, the code locks the order **and then** the wallet
(`lockOrder`: `FOR UPDATE OF orders`, then `FROM wallet.account … FOR UPDATE`).
A fixed locking order across all code paths prevents deadlocks.

### 10.8 Listing orders with their items

`orderSelect` / `listOrders`

```sql
SELECT orders.id, orders.status, orders.total_minor::text,
       concat_ws(' ', profile.first_name, profile.last_name) AS customer_name,
       json_agg(json_build_object('productName', item.product_name,
                                  'quantity', item.quantity::text) ORDER BY item.product_name) AS items
FROM canteen.customer_order orders
JOIN core.user_profile profile ON profile.id = orders.customer_user_profile_id
JOIN canteen.order_item item   ON item.order_id = orders.id
WHERE orders.customer_user_profile_id = $1
GROUP BY orders.id, profile.id
ORDER BY CASE orders.status
           WHEN 'PLACED' THEN 0 WHEN 'PREPARING' THEN 1 WHEN 'READY' THEN 2 ELSE 3
         END,
         orders.created_at DESC
LIMIT 100;
```

Read it as: **join** order → customer → lines; **group** back to one row per order;
`json_agg` collects the lines into an array; **`CASE` inside `ORDER BY`** puts
active orders first (a custom sort order that plain `ORDER BY status` cannot
express); newest first within each group; max 100 rows.

### 10.9 Tea & cafe brews

[`tea-cafe.repository.ts`](../../apps/api/src/modules/tea-cafe/tea-cafe.repository.ts)

```sql
-- start a brew: ready_at is computed by the database clock
INSERT INTO tea_cafe.brew (service_unit_id, beverage_type, note, duration_minutes, ready_at, created_by_user_profile_id)
VALUES ($1, $2, $3, $4, now() + make_interval(mins => $4), $5);

-- the visible list: still brewing first (soonest ready first), then ready (most recent first)
SELECT brew.id, brew.beverage_type, brew.ready_at
FROM tea_cafe.brew
JOIN core.service_unit service ON service.id = brew.service_unit_id
WHERE service.code = 'tea-cafe-main' AND service.active AND brew.deleted_at IS NULL
ORDER BY (brew.ready_at <= now()),                                       -- false (0) before true (1)
         CASE WHEN brew.ready_at >  now() THEN brew.ready_at END,        -- ascending for brewing
         CASE WHEN brew.ready_at <= now() THEN brew.ready_at END DESC,   -- descending for ready
         brew.id;

-- soft delete with UPDATE ... FROM (join in an UPDATE) and RETURNING to detect "not found"
UPDATE tea_cafe.brew AS brew
SET deleted_at = now(), deleted_by_user_profile_id = $2
FROM core.service_unit AS service
WHERE brew.id = $1 AND brew.service_unit_id = service.id
  AND service.code = 'tea-cafe-main' AND brew.deleted_at IS NULL
RETURNING brew.id;
```

Tricks worth learning here:

- A boolean expression in `ORDER BY` (`false` sorts before `true`) splits rows into two groups.
- Two `CASE` expressions sort each group in a different direction; a `CASE`
  without `ELSE` yields `NULL` for non-matching rows, which are ignored by that key.
- `UPDATE … FROM` lets an update use columns of another table.
- If `RETURNING` gives zero rows, nothing matched, which the code turns into a "not found" error.

### 10.10 Laundry: runs, timing and the one-way guard

[`laundry.repository.ts`](../../apps/api/src/modules/laundry/laundry.repository.ts)

```sql
-- the run that currently holds a load, plus "is it ready yet?" computed in SQL
SELECT *, price_minor::text, ready_at <= clock_timestamp() AS is_ready
FROM laundry.machine_run
WHERE load_id = $1 AND status = 'IN_MACHINE'
FOR UPDATE;

-- start a run: both timestamps from the same clock reading
INSERT INTO laundry.machine_run (load_id, machine_type, machine_number, price_minor,
  idempotency_key, started_by_user_profile_id, duration_seconds, started_at, ready_at)
VALUES ($1, $2, $3, $4, $5, $6, $7::integer, statement_timestamp(),
        statement_timestamp() + ($7::integer * interval '1 second'))
RETURNING id;

-- remove from the machine (the trigger allows only IN_MACHINE -> REMOVED)
UPDATE laundry.machine_run
SET status = 'REMOVED', removed_at = clock_timestamp(), removed_by_user_profile_id = $2
WHERE id = $1;

-- which machines are occupied right now?
SELECT machine_type, machine_number, load_id FROM laundry.machine_run WHERE status = 'IN_MACHINE';
```

| Time function           | Value                                                    |
| ----------------------- | -------------------------------------------------------- |
| `now()`                 | start of the **transaction** (same value all through it) |
| `statement_timestamp()` | start of the **current statement**                       |
| `clock_timestamp()`     | the real clock, changes even inside one statement        |

Starting a run on an occupied machine fails because of the partial unique index
`laundry_active_machine_idx` (§8.5). The application does not need an extra check
to be correct, it only needs one to give a friendly message.

The history tables are updated with a normal `INSERT`:

```sql
INSERT INTO laundry.load_event (load_id, run_id, event_type, actor_user_profile_id, details, created_at)
VALUES ($1, $2, 'RUN_STARTED', $3, $4, clock_timestamp());
```

### 10.11 The migration runner

[`migrate.ts`](../../apps/api/scripts/migrate.ts)

Migrations are plain `.sql` files applied in filename order. The table
`public.schema_migration(filename, applied_at)` remembers which were applied, so
running the runner twice does nothing the second time.

---

## Part 11 — Cheat sheet and common mistakes

### Reading order of any query

1. `FROM` / `JOIN`: which tables, and how are they connected?
2. `WHERE`: which rows?
3. `GROUP BY` / `HAVING`: what is summarised?
4. `SELECT`: which columns, aliases, `CASE`, `json_agg`?
5. `ORDER BY` / `LIMIT`: sorting and slicing.
6. `FOR UPDATE`: does it lock rows? then it is part of a transaction.

### Quick reference

| I want to…                      | Use                                              |
| ------------------------------- | ------------------------------------------------ |
| read columns                    | `SELECT … FROM …`                                |
| filter rows / groups            | `WHERE` / `HAVING`                               |
| sort, take N                    | `ORDER BY … LIMIT n`                             |
| link tables                     | `JOIN … ON a.fk = b.id`                          |
| keep rows with no partner       | `LEFT JOIN … WHERE b.id IS NULL` or `NOT EXISTS` |
| count / total / average         | `COUNT`, `SUM`, `AVG` + `GROUP BY`               |
| conditional logic               | `CASE WHEN … THEN … ELSE … END`                  |
| default for NULL                | `COALESCE(x, default)`                           |
| name a step                     | `WITH name AS (…)`                               |
| latest row per group            | `DISTINCT ON` or `ROW_NUMBER() … = 1`            |
| running total, ranking          | window functions `OVER (…)`                      |
| add / change / remove rows      | `INSERT` / `UPDATE` / `DELETE`                   |
| get generated values back       | `RETURNING`                                      |
| insert or ignore/update         | `ON CONFLICT`                                    |
| group steps atomically          | `BEGIN … COMMIT`                                 |
| prevent concurrent double-spend | `SELECT … FOR UPDATE`                            |
| build JSON                      | `json_build_object`, `json_agg`                  |

### Useful checks for this database

```sql
-- Does every wallet balance match its ledger? (should return 0 rows)
SELECT a.id, a.available_minor, a.held_minor,
       COALESCE(SUM(l.available_delta_minor), 0) AS ledger_available,
       COALESCE(SUM(l.held_delta_minor), 0)      AS ledger_held
FROM wallet.account a
LEFT JOIN wallet.ledger_entry l ON l.account_id = a.id
GROUP BY a.id
HAVING a.available_minor <> COALESCE(SUM(l.available_delta_minor), 0)
    OR a.held_minor      <> COALESCE(SUM(l.held_delta_minor), 0);

-- Orders whose total does not equal the sum of their lines (should be 0 rows)
SELECT o.id, o.total_minor, SUM(i.line_total_minor) AS lines_total
FROM canteen.customer_order o
JOIN canteen.order_item i ON i.order_id = o.id
GROUP BY o.id
HAVING o.total_minor <> SUM(i.line_total_minor);

-- Machines currently in use
SELECT machine_type, machine_number, ready_at, ready_at <= now() AS finished
FROM laundry.machine_run
WHERE status = 'IN_MACHINE'
ORDER BY machine_type, machine_number;

-- Which migrations have been applied?
SELECT filename, applied_at FROM public.schema_migration ORDER BY filename;
```

### Common mistakes

| Mistake                                        | Why it hurts                        | Fix                                                        |
| ---------------------------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| `UPDATE`/`DELETE` without `WHERE`              | changes every row                   | write `WHERE` first, test with `SELECT`, use a transaction |
| `x = NULL`                                     | never true                          | `x IS NULL`                                                |
| `SELECT *` in application code                 | slow, breaks on schema change       | list columns                                               |
| joining two child tables then `GROUP BY`       | rows multiply, totals inflate       | aggregate each child in a subquery/CTE                     |
| `WHERE` on an aggregate (`WHERE COUNT(*) > 1`) | error: aggregates run after `WHERE` | use `HAVING`                                               |
| string-building SQL with user input            | SQL injection                       | parameters (`$1`)                                          |
| read balance → compute in code → write back    | lost updates under concurrency      | lock (`FOR UPDATE`) and/or atomic `SET x = x - $1`         |
| function on an indexed column in `WHERE`       | index not used                      | compare the raw column to a range                          |
| forgetting `ORDER BY` with `LIMIT`             | random rows                         | always sort first                                          |
| treating money as decimal numbers in JS        | precision loss                      | `bigint` kuruş and `::text` + `BigInt`                     |

### Where to go next

- Table and column meanings: [`README.md`](./README.md) and the schema documents.
- The authoritative SQL: [`apps/api/migrations`](../../apps/api/migrations/README.md).
- PostgreSQL manual: <https://www.postgresql.org/docs/current/>.
