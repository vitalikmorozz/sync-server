import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

/**
 * Permission types for API keys
 */
export const permissionEnum = pgEnum("permission", ["read", "write"]);

/**
 * API keys for authenticating client requests.
 * Keys are scoped to a specific store with granular permissions.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // SHA-256 hash of the full key (64 hex chars)
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    // First chars of key for identification in UI (e.g., "sk_store_abc1")
    keyPrefix: varchar("key_prefix", { length: 20 }).notNull(),
    // Array of permissions: ["read"], ["write"], or ["read", "write"]
    permissions: permissionEnum("permissions").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    // If set, the key has been revoked and cannot be used
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    keyHashIdx: uniqueIndex("api_keys_key_hash_idx").on(table.keyHash),
  }),
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Permission = "read" | "write";
