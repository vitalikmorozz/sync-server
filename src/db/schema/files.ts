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
  },
  (table) => ({
    // Unique constraint: each path is unique per store
    storePathUniqueIdx: uniqueIndex("files_store_path_unique_idx").on(
      table.storeId,
      table.path,
    ),
    // Index for listing files in a store
    storeIdIdx: index("files_store_id_idx").on(table.storeId),
  }),
);

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
