## ADDED Requirements

### Requirement: Settings table schema

Settings files stored per store, with soft-delete support via `expires_at`. Structurally mirrors the `files` table but stores vault configuration files separately.

| Column       | Type                | Nullable | Default             | Description                       |
| ------------ | ------------------- | -------- | ------------------- | --------------------------------- |
| `id`         | `uuid`              | NOT NULL | `gen_random_uuid()` | Primary key                       |
| `store_id`   | `uuid`              | NOT NULL | —                   | FK -> `stores.id` (CASCADE)       |
| `path`       | `text`              | NOT NULL | —                   | Relative path within `.obsidian/` |
| `content`    | `text`              | NOT NULL | —                   | File contents (text)              |
| `hash`       | `varchar(71)`       | NOT NULL | —                   | `sha256:{64-char hex}` (71 chars) |
| `size`       | `integer`           | NOT NULL | —                   | Size in bytes                     |
| `is_binary`  | `boolean`           | NOT NULL | `false`             | Whether the file is binary        |
| `extension`  | `text`              | NULL     | —                   | File extension, lowercase, no dot |
| `created_at` | `timestamp with tz` | NOT NULL | `now()`             | Creation time                     |
| `updated_at` | `timestamp with tz` | NOT NULL | `now()`             | Last modification time            |
| `expires_at` | `timestamp with tz` | NULL     | —                   | Tombstone expiry (null = active)  |

**Indexes**:

| Index Name                       | Columns            | Type         | Purpose                              |
| -------------------------------- | ------------------ | ------------ | ------------------------------------ |
| `settings_store_path_unique_idx` | `(store_id, path)` | UNIQUE btree | One settings file per path per store |
| `settings_store_id_idx`          | `(store_id)`       | btree        | List settings in a store             |
| `settings_expires_at_idx`        | `(expires_at)`     | btree        | Efficient tombstone cleanup          |

**Relations**: Belongs to `stores` (many-to-one, cascade delete).

#### Scenario: Settings table created with correct schema

- **WHEN** the migration runs
- **THEN** the `settings` table SHALL exist with all columns, constraints, and indexes as specified

#### Scenario: Unique constraint enforced per store

- **WHEN** two settings files with the same `path` are inserted for the same `store_id`
- **THEN** the database SHALL reject the second insert with a unique constraint violation

#### Scenario: Store deletion cascades to settings

- **WHEN** a store is deleted
- **THEN** all settings rows for that store SHALL be automatically deleted via CASCADE

### Requirement: Migration for settings table and permissions

A new migration SHALL create the `settings` table with all columns and indexes, and add `settings_read` and `settings_write` values to the `permission` enum type.

#### Scenario: Migration adds permission enum values

- **WHEN** the migration executes
- **THEN** the `permission` PostgreSQL enum type SHALL include the values `settings_read` and `settings_write` in addition to existing values `read` and `write`

#### Scenario: Migration creates settings table

- **WHEN** the migration executes
- **THEN** the `settings` table SHALL be created with the schema specified in the "Settings table schema" requirement

#### Scenario: Migration is additive only

- **WHEN** the migration runs on a database with existing data
- **THEN** no existing tables, columns, or data SHALL be modified — the migration only adds new objects

## MODIFIED Requirements

### Requirement: Files table schema

Files stored in each store, with soft-delete support via `expires_at`, binary detection, and file extension tracking.

| Column       | Type                | Nullable | Default             | Description                               |
| ------------ | ------------------- | -------- | ------------------- | ----------------------------------------- |
| `id`         | `uuid`              | NOT NULL | `gen_random_uuid()` | Primary key                               |
| `store_id`   | `uuid`              | NOT NULL | —                   | FK -> `stores.id` (CASCADE)               |
| `path`       | `text`              | NOT NULL | —                   | Relative file path within the store       |
| `content`    | `text`              | NOT NULL | —                   | File contents (text or base64 for binary) |
| `hash`       | `varchar(71)`       | NOT NULL | —                   | `sha256:{64-char hex}` (71 chars)         |
| `size`       | `integer`           | NOT NULL | —                   | Size in bytes                             |
| `is_binary`  | `boolean`           | NOT NULL | `false`             | Whether the file is binary                |
| `extension`  | `text`              | NULL     | —                   | File extension, lowercase, no dot         |
| `created_at` | `timestamp with tz` | NOT NULL | `now()`             | Creation time                             |
| `updated_at` | `timestamp with tz` | NOT NULL | `now()`             | Last modification time                    |
| `expires_at` | `timestamp with tz` | NULL     | —                   | Tombstone expiry (null = active)          |

**Indexes**:

| Index Name                    | Columns                 | Type         | Purpose                       |
| ----------------------------- | ----------------------- | ------------ | ----------------------------- |
| `files_store_path_unique_idx` | `(store_id, path)`      | UNIQUE btree | One file per path per store   |
| `files_store_id_idx`          | `(store_id)`            | btree        | List files in a store         |
| `files_expires_at_idx`        | `(expires_at)`          | btree        | Efficient tombstone cleanup   |
| `files_extension_idx`         | `(store_id, extension)` | btree        | Filter by extension per store |

Note: The files table schema itself is unchanged. This MODIFIED entry documents that the `stores` table now has an additional relation — stores have many `settings` in addition to many `files` and many `api_keys`.

#### Scenario: Store relations include settings

- **WHEN** the Drizzle schema relations are defined
- **THEN** the `stores` table SHALL have relations to `files`, `api_keys`, AND `settings` tables
