import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  varchar,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Tombstone TTL: 30 days in milliseconds */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
import { stores } from "./stores";

/**
 * Files stored in each store.
 * Content is stored as text (for text files) or base64-encoded (for binary files).
 */
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    // Relative file path within the store (e.g., "notes/daily/2024-01-15.md")
    path: text("path").notNull(),
    // File contents (text or base64-encoded binary)
    content: text("content").notNull(),
    // Content hash in format "sha256:xxxx..." (71 chars total)
    hash: varchar("hash", { length: 71 }).notNull(),
    // File size in bytes
    size: integer("size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Soft-delete TTL: null = active file, non-null = tombstone that expires at this time
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => ({
    // Unique constraint: each path is unique per store
    storePathUniqueIdx: uniqueIndex("files_store_path_unique_idx").on(
      table.storeId,
      table.path,
    ),
    // Index for listing files in a store
    storeIdIdx: index("files_store_id_idx").on(table.storeId),
    // Index for efficient tombstone cleanup
    expiresAtIdx: index("files_expires_at_idx").on(table.expiresAt),
  }),
);

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
