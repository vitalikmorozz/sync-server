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

#### Scenario: New columns have correct defaults for existing data

- **WHEN** the migration runs on a database with existing files
- **THEN** all existing rows SHALL have `is_binary` set to `false` and `extension` populated by extracting the extension from their `path` column

#### Scenario: Extension extracted from path on insert

- **WHEN** a file is inserted with path `notes/daily/2024-01-15.md`
- **THEN** the `extension` column SHALL be set to `"md"` and `is_binary` SHALL be set to `false`

#### Scenario: Extension is null for extensionless files

- **WHEN** a file is inserted with path `Makefile`
- **THEN** the `extension` column SHALL be `null`

#### Scenario: Extension updated on rename

- **WHEN** a file's path is updated from `photo.png` to `photo.jpg`
- **THEN** the `extension` column SHALL be updated to `"jpg"`

### Requirement: Migration for binary support columns

A new migration SHALL add the `is_binary` and `extension` columns to the `files` table, create the `files_extension_idx` index, and backfill `extension` values for existing rows.

#### Scenario: Migration adds columns with defaults

- **WHEN** the migration executes
- **THEN** `is_binary` column SHALL be added as `boolean NOT NULL DEFAULT false` and `extension` column SHALL be added as `text` (nullable)

#### Scenario: Migration backfills extension from path

- **WHEN** the migration runs on a database with existing file rows
- **THEN** the `extension` column SHALL be populated by extracting the file extension from each row's `path` value (lowercase, no dot). Paths without extensions SHALL have `extension` set to `null`.

#### Scenario: Migration creates extension index

- **WHEN** the migration completes
- **THEN** a btree index `files_extension_idx` SHALL exist on `(store_id, extension)`
