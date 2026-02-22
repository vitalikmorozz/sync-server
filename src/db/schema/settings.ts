import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  varchar,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";

/** Tombstone TTL: 30 days in milliseconds */
export const SETTINGS_TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Vault settings files stored per store.
 * Mirrors the files table structure but stores .obsidian/ configuration separately.
 * Paths are relative to .obsidian/ (e.g., "app.json", "plugins/excalidraw/data.json").
 */
export const settings = pgTable(
  "settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // Relative path within .obsidian/ (e.g., "app.json", "plugins/excalidraw/data.json")
    path: text("path").notNull(),
    // File contents (text)
    content: text("content").notNull(),
    // Content hash in format "sha256:xxxx..." (71 chars total)
    hash: varchar("hash", { length: 71 }).notNull(),
    // File size in bytes
    size: integer("size").notNull(),
    // Whether the file is binary
    isBinary: boolean("is_binary").notNull().default(false),
    // File extension, lowercase, no dot (e.g., "json", "css"). Null for extensionless files.
    extension: text("extension"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Soft-delete TTL: null = active, non-null = tombstone that expires at this time
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => ({
    // Unique constraint: each path is unique per store
    storePathUniqueIdx: uniqueIndex("settings_store_path_unique_idx").on(
      table.storeId,
      table.path,
    ),
    // Index for listing settings in a store
    storeIdIdx: index("settings_store_id_idx").on(table.storeId),
    // Index for efficient tombstone cleanup
    expiresAtIdx: index("settings_expires_at_idx").on(table.expiresAt),
  }),
);

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
