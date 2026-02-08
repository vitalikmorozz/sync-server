import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Stores represent isolated file namespaces (e.g., Obsidian vaults).
 * Each store has its own set of files and API keys.
 */
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

export type Store = typeof stores.$inferSelect;
export type NewStore = typeof stores.$inferInsert;
