import { relations } from "drizzle-orm";
import { stores, type Store, type NewStore } from "./stores";
import {
  apiKeys,
  permissionEnum,
  type ApiKey,
  type NewApiKey,
  type Permission,
} from "./apiKeys";
import { files, type File, type NewFile } from "./files";

// ============================================================================
// Relations
// ============================================================================

/**
 * Store relations - a store has many API keys and files
 */
export const storesRelations = relations(stores, ({ many }) => ({
  apiKeys: many(apiKeys),
  files: many(files),
}));

/**
 * API key relations - an API key belongs to one store
 */
export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  store: one(stores, {
    fields: [apiKeys.storeId],
    references: [stores.id],
  }),
}));

/**
 * File relations - a file belongs to one store
 */
export const filesRelations = relations(files, ({ one }) => ({
  store: one(stores, {
    fields: [files.storeId],
    references: [stores.id],
  }),
}));

// ============================================================================
// Exports
// ============================================================================

// Tables
export { stores, apiKeys, files, permissionEnum };

// Types
export type { Store, NewStore, ApiKey, NewApiKey, Permission, File, NewFile };
