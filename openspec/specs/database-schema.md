# Database Schema

## Overview

PostgreSQL 15+ with Drizzle ORM. Three tables, one custom enum type, and automatic migrations on server startup.

## Tables

### stores

Isolated file namespaces, each mapping to one Obsidian vault.

| Column       | Type                | Nullable | Default             | Description         |
| ------------ | ------------------- | -------- | ------------------- | ------------------- |
| `id`         | `uuid`              | NOT NULL | `gen_random_uuid()` | Primary key         |
| `name`       | `text`              | NOT NULL | —                   | Human-readable name |
| `created_at` | `timestamp with tz` | NOT NULL | `now()`             | Creation time       |
| `updated_at` | `timestamp with tz` | NOT NULL | `now()`             | Last modification   |

**Relations**: Has many `api_keys`, has many `files`. Deleting a store cascades to all its keys and files.

### api_keys

Authentication keys scoped to a single store.

| Column         | Type                | Nullable | Default             | Description                    |
| -------------- | ------------------- | -------- | ------------------- | ------------------------------ |
| `id`           | `uuid`              | NOT NULL | `gen_random_uuid()` | Primary key                    |
| `store_id`     | `uuid`              | NOT NULL | —                   | FK -> `stores.id` (CASCADE)    |
| `name`         | `text`              | NOT NULL | —                   | Human-readable key name        |
| `key_hash`     | `varchar(64)`       | NOT NULL | —                   | SHA-256 hex hash of full key   |
| `key_prefix`   | `varchar(20)`       | NOT NULL | —                   | First 16 chars for display     |
| `permissions`  | `permission[]`      | NOT NULL | —                   | Array of `'read'` / `'write'`  |
| `created_at`   | `timestamp with tz` | NOT NULL | `now()`             | Creation time                  |
| `last_used_at` | `timestamp with tz` | NULL     | —                   | Updated on each authentication |
| `revoked_at`   | `timestamp with tz` | NULL     | —                   | Non-null = key is revoked      |

**Indexes**: `api_keys_key_hash_idx` — UNIQUE btree on `key_hash`.

The `permission` enum is defined as:

```sql
CREATE TYPE "public"."permission" AS ENUM('read', 'write');
```

### files

Files stored in each store, with soft-delete support via `expires_at`.

| Column       | Type                | Nullable | Default             | Description                         |
| ------------ | ------------------- | -------- | ------------------- | ----------------------------------- |
| `id`         | `uuid`              | NOT NULL | `gen_random_uuid()` | Primary key                         |
| `store_id`   | `uuid`              | NOT NULL | —                   | FK -> `stores.id` (CASCADE)         |
| `path`       | `text`              | NOT NULL | —                   | Relative file path within the store |
| `content`    | `text`              | NOT NULL | —                   | File contents (text)                |
| `hash`       | `varchar(71)`       | NOT NULL | —                   | `sha256:{64-char hex}` (71 chars)   |
| `size`       | `integer`           | NOT NULL | —                   | Size in bytes                       |
| `created_at` | `timestamp with tz` | NOT NULL | `now()`             | Creation time                       |
| `updated_at` | `timestamp with tz` | NOT NULL | `now()`             | Last modification time              |
| `expires_at` | `timestamp with tz` | NULL     | —                   | Tombstone expiry (null = active)    |

**Indexes**:

| Index Name                    | Columns            | Type         | Purpose                     |
| ----------------------------- | ------------------ | ------------ | --------------------------- |
| `files_store_path_unique_idx` | `(store_id, path)` | UNIQUE btree | One file per path per store |
| `files_store_id_idx`          | `(store_id)`       | btree        | List files in a store       |
| `files_expires_at_idx`        | `(expires_at)`     | btree        | Efficient tombstone cleanup |

## Soft Delete Mechanics

When a file is deleted:

1. `content` is set to `""` (frees storage)
2. `hash` is set to `sha256:{hash of empty string}`
3. `size` is set to `0`
4. `expires_at` is set to `now() + 30 days`
5. `updated_at` is set to `now()`

The row remains in the database as a **tombstone** until `expires_at` passes.

### Tombstone Resurrection

When a file is created or updated at a path that has a tombstone:

- The existing row is reused (same UUID)
- `expires_at` is cleared to `null`
- `content`, `hash`, `size`, `updated_at` are updated with new values
- This avoids violating the `(store_id, path)` unique constraint

### Lazy Cleanup

Expired tombstones (`expires_at < now()`) are permanently deleted during file listing operations. The cleanup runs as a fire-and-forget query — it does not block the response.

## Migrations

Managed by Drizzle Kit. Migration files are stored in `src/db/migrations/` and consist of SQL files plus a `meta/_journal.json` tracking applied migrations.

Migrations run **automatically on server startup** before the HTTP server starts listening. If migrations fail, the server process exits with code 1.

| Migration | Tag                     | Description                                               |
| --------- | ----------------------- | --------------------------------------------------------- |
| 0000      | `0000_fresh_tigra`      | Initial schema: `stores`, `api_keys`, `files` tables      |
| 0001      | `0001_cute_betty_brant` | Adds `expires_at` column and `files_expires_at_idx` index |

## Connection Pool

PostgreSQL connection via `pg.Pool`:

| Setting                   | Value |
| ------------------------- | ----- |
| `max`                     | 10    |
| `idleTimeoutMillis`       | 30000 |
| `connectionTimeoutMillis` | 5000  |
