# Tea & Cafe Module

This module publishes live tea and coffee brew times to authenticated portal
users. Every authenticated user can create and remove brew records.

## Rules

- Tea always uses a server-enforced 21-minute duration.
- Coffee duration is selected by the user from 1 to 180 whole minutes.
- Multiple brews can remain visible at the same time.
- Deleting a brew is a soft delete so its creator and deletion metadata remain
  available for audit purposes.
- The database stores both `started_at` and `ready_at`; clients never calculate
  the authoritative ready time themselves.

## Endpoints

| Method   | Path                                | Access               | Purpose            |
| -------- | ----------------------------------- | -------------------- | ------------------ |
| `GET`    | `/api/v1/tea-cafe/brews`            | Authenticated        | List visible brews |
| `GET`    | `/api/v1/tea-cafe/manage/brews`     | Authenticated        | List visible brews |
| `POST`   | `/api/v1/tea-cafe/manage/brews`     | Authenticated        | Create a brew      |
| `DELETE` | `/api/v1/tea-cafe/manage/brews/:id` | Authenticated        | Soft-delete a brew |
