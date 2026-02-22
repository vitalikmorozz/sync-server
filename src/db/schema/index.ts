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
import { settings, type Setting, type NewSetting } from "./settings";

// ============================================================================
// Relations
// ============================================================================

/**
 * Store relations - a store has many API keys, files, and settings
 */
export const storesRelations = relations(stores, ({ many }) => ({
  apiKeys: many(apiKeys),
  files: many(files),
  settings: many(settings),
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

/**
 * Setting relations - a setting belongs to one store
 */
export const settingsRelations = relations(settings, ({ one }) => ({
  store: one(stores, {
    fields: [settings.storeId],
    references: [stores.id],
  }),
}));

// ============================================================================
// Exports
// ============================================================================

// Tables
export { stores, apiKeys, files, settings, permissionEnum };

// Types
export type {
  Store,
  NewStore,
  ApiKey,
  NewApiKey,
  Permission,
  File,
  NewFile,
  Setting,
  NewSetting,
};
