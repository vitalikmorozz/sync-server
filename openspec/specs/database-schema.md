# Database Schema

## Overview

The database layer uses Drizzle ORM with PostgreSQL as the primary database. The schema is designed to be simple and support easy migration to other databases (SQLite, MySQL) if needed.

## Tables

### stores

Stores represent isolated file namespaces (e.g., Obsidian vaults).

```typescript
// src/db/schema/stores.ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

| Column     | Type      | Description                 |
| ---------- | --------- | --------------------------- |
| id         | UUID      | Primary key, auto-generated |
| name       | TEXT      | Human-readable store name   |
| created_at | TIMESTAMP | Creation timestamp          |
| updated_at | TIMESTAMP | Last modification timestamp |

---

### api_keys

API keys for authenticating client requests.

```typescript
// src/db/schema/apiKeys.ts
import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  pgEnum,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

export const permissionEnum = pgEnum("permission", ["read", "write"]);

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
  keyPrefix: varchar("key_prefix", { length: 20 }).notNull(),
  permissions: permissionEnum("permissions").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
```

| Column       | Type        | Description                           |
| ------------ | ----------- | ------------------------------------- |
| id           | UUID        | Primary key                           |
| store_id     | UUID        | Foreign key to stores                 |
| name         | TEXT        | Human-readable key name               |
| key_hash     | VARCHAR(64) | SHA-256 hash of the full key          |
| key_prefix   | VARCHAR(20) | First chars of key for identification |
| permissions  | ENUM[]      | Array of permissions (read, write)    |
| created_at   | TIMESTAMP   | Creation timestamp                    |
| last_used_at | TIMESTAMP   | Last usage timestamp                  |
| revoked_at   | TIMESTAMP   | Revocation timestamp (null if active) |

**Note:** The full API key is never stored. Only the hash is kept for validation.

---

### files

Files stored in each store.

```typescript
// src/db/schema/files.ts
import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    content: text("content").notNull(),
    hash: varchar("hash", { length: 71 }).notNull(), // "sha256:" + 64 hex chars
    size: integer("size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    storePathIdx: index("files_store_path_idx").on(table.storeId, table.path),
    storeIdIdx: index("files_store_id_idx").on(table.storeId),
  }),
);
```

| Column     | Type        | Description                     |
| ---------- | ----------- | ------------------------------- |
| id         | UUID        | Primary key                     |
| store_id   | UUID        | Foreign key to stores           |
| path       | TEXT        | Relative file path within store |
| content    | TEXT        | File contents (text or base64)  |
| hash       | VARCHAR(71) | Content hash (sha256:xxxx...)   |
| size       | INTEGER     | File size in bytes              |
| created_at | TIMESTAMP   | Creation timestamp              |
| updated_at | TIMESTAMP   | Last modification timestamp     |

**Unique Constraint:** `(store_id, path)` - each path is unique per store.

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         stores                              │
├─────────────────────────────────────────────────────────────┤
│ id (PK)          │ UUID                                     │
│ name             │ TEXT                                     │
│ created_at       │ TIMESTAMP                                │
│ updated_at       │ TIMESTAMP                                │
└─────────────────────────────────────────────────────────────┘
           │                              │
           │ 1:N                          │ 1:N
           ▼                              ▼
┌─────────────────────────────┐  ┌─────────────────────────────┐
│        api_keys             │  │          files              │
├─────────────────────────────┤  ├─────────────────────────────┤
│ id (PK)        │ UUID       │  │ id (PK)        │ UUID       │
│ store_id (FK)  │ UUID       │  │ store_id (FK)  │ UUID       │
│ name           │ TEXT       │  │ path           │ TEXT       │
│ key_hash       │ VARCHAR    │  │ content        │ TEXT       │
│ key_prefix     │ VARCHAR    │  │ hash           │ VARCHAR    │
│ permissions    │ ENUM[]     │  │ size           │ INTEGER    │
│ created_at     │ TIMESTAMP  │  │ created_at     │ TIMESTAMP  │
│ last_used_at   │ TIMESTAMP  │  │ updated_at     │ TIMESTAMP  │
│ revoked_at     │ TIMESTAMP  │  │                │            │
└─────────────────────────────┘  └─────────────────────────────┘

                                 UNIQUE(store_id, path)
```

---

## Indexes

| Index Name              | Table    | Columns          | Purpose                                   |
| ----------------------- | -------- | ---------------- | ----------------------------------------- |
| `files_store_path_idx`  | files    | (store_id, path) | Fast file lookup by path                  |
| `files_store_id_idx`    | files    | (store_id)       | List files in store                       |
| `api_keys_key_hash_idx` | api_keys | (key_hash)       | Fast key validation (implicit via unique) |

---

## Migrations

Drizzle generates migrations automatically. Structure:

```
src/db/
├── schema/
│   ├── index.ts          # Export all tables
│   ├── stores.ts
│   ├── apiKeys.ts
│   └── files.ts
├── migrations/
│   ├── 0000_initial.sql
│   └── meta/
│       └── _journal.json
└── index.ts              # Database connection
```

### Running Migrations

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate

# Push schema directly (development)
npx drizzle-kit push
```

---

## Drizzle Configuration

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

---

## Database Connection

```typescript
// src/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
```

---

## Query Examples

### Get file by path

```typescript
const file = await db.query.files.findFirst({
  where: and(eq(files.storeId, storeId), eq(files.path, path)),
});
```

### List files in store

```typescript
const storeFiles = await db.query.files.findMany({
  where: eq(files.storeId, storeId),
  orderBy: files.path,
  limit: 100,
});
```

### Validate API key

```typescript
const key = await db.query.apiKeys.findFirst({
  where: and(
    eq(apiKeys.keyHash, hashKey(providedKey)),
    isNull(apiKeys.revokedAt),
  ),
  with: {
    store: true,
  },
});
```
