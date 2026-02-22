## 1. Database Schema & Migration

- [ ] 1.1 Update the `permission` enum in `src/db/schema/apiKeys.ts` to add `settings_read` and `settings_write` values
- [ ] 1.2 Update the `Permission` type alias in `src/db/schema/apiKeys.ts` to include the new values
- [ ] 1.3 Update the `permissionSchema` Zod enum in `src/schemas/index.ts` to include `settings_read` and `settings_write`
- [ ] 1.4 Create `src/db/schema/settings.ts` with the `settings` table schema (mirrors `files` table: id, store_id, path, content, hash, size, is_binary, extension, created_at, updated_at, expires_at)
- [ ] 1.5 Add indexes to settings schema: `settings_store_path_unique_idx` (UNIQUE on store_id, path), `settings_store_id_idx`, `settings_expires_at_idx`
- [ ] 1.6 Add the `settings` relation to the `stores` table in `src/db/schema/index.ts` (stores has many settings)
- [ ] 1.7 Re-export settings table and relations from `src/db/schema/index.ts`
- [ ] 1.8 Generate Drizzle migration with `drizzle-kit generate` — verify the migration includes `ALTER TYPE "permission" ADD VALUE` statements and the `CREATE TABLE settings`
- [ ] 1.9 Verify migration runs cleanly on a fresh database and on a database with existing data

## 2. Server Settings Service

- [ ] 2.1 Create `src/services/settings.ts` with `cleanupExpiredSettings(storeId)` function (delete rows where `expires_at < now()`)
- [ ] 2.2 Add `listSettings(storeId)` function — return all active settings (metadata only: path, hash, size, extension, isBinary, createdAt, updatedAt) with lazy tombstone cleanup
- [ ] 2.3 Add `getSetting(storeId, path)` function — return a single active setting with content, or null if not found/tombstoned
- [ ] 2.4 Add `upsertSetting(storeId, path, content)` function — create or update a setting, handling tombstone resurrection, computing hash/size/extension/isBinary
- [ ] 2.5 Add `deleteSetting(storeId, path)` function — soft-delete by setting `expires_at`, preserving content
- [ ] 2.6 Add `deleteAllSettings(storeId)` function — soft-delete all active settings, return count

## 3. Server Zod Schemas

- [ ] 3.1 Add `settingUpsertSchema` to `src/schemas/index.ts` — validates `{ path: string, content: string }` with the same path constraints as files
- [ ] 3.2 Add `settingPathQuerySchema` to `src/schemas/index.ts` — validates the `path` query parameter for GET/DELETE

## 4. Server Settings Routes

- [ ] 4.1 Create `src/routes/settings.ts` with Fastify plugin structure, `requireAuth` hook applied to all routes
- [ ] 4.2 Add `GET /` handler — dual-purpose: if `path` query param provided, return single setting with content (calls `getSetting`); otherwise return list (calls `listSettings`). Requires `settings_read` permission.
- [ ] 4.3 Add `PUT /` handler — upsert a single setting. Requires `settings_write` permission. Validates body with `settingUpsertSchema`.
- [ ] 4.4 Add `DELETE /` handler — soft-delete a single setting by `path` query param. Requires `settings_write` permission.
- [ ] 4.5 Add `DELETE /all` handler — soft-delete all settings. Requires `settings_write` permission. Returns `{ deleted: count }`.
- [ ] 4.6 Register settings routes in `src/routes/index.ts` with prefix `/api/v1/settings`

## 5. Server Permission Middleware Update

- [ ] 5.1 Update the `requirePermission` function signature in `src/middleware/auth.ts` to accept the new permission values (`settings_read`, `settings_write`) — update the type from `"read" | "write"` to use the `Permission` type from schema

## 6. Client Plugin Types

- [ ] 6.1 Add `SettingsListResponse` type to `src/types.ts` — `{ settings: Array<{ path, hash, size, extension, isBinary, createdAt, updatedAt }>, total: number }`
- [ ] 6.2 Add `SettingsContentResponse` type to `src/types.ts` — `{ path, content, hash, size, extension, isBinary, createdAt, updatedAt }`

## 7. Client Settings Sync Service

- [ ] 7.1 Create `src/settingsSync.ts` with `SettingsSyncService` class that takes `vault`, `settings` (url + apiKey)
- [ ] 7.2 Add `EXCLUDED_PATHS` constant: `["workspace.json", "workspace-mobile.json"]` and `EXCLUDED_PREFIXES` constant: `["plugins/sync-server/"]`
- [ ] 7.3 Add `isExcluded(path)` helper — returns true if path matches any excluded path or prefix
- [ ] 7.4 Add `collectLocalSettings()` method — uses `vault.adapter.list(".obsidian")` recursively to enumerate all files, filters out excluded paths, reads content via `adapter.read()`, returns array of `{ path, content }`
- [ ] 7.5 Add `pushSettings()` method — calls `DELETE /api/v1/settings/all`, then loops through collected local settings calling `PUT /api/v1/settings` for each, shows completion notice with count
- [ ] 7.6 Add `pullSettings()` method — calls `GET /api/v1/settings` for list, then `GET /api/v1/settings?path=...` for each file's content, writes to local `.obsidian/` via `adapter.write()`, deletes local-only non-excluded files, shows completion notice with restart recommendation

## 8. Client Plugin UI & Commands

- [ ] 8.1 Add "Vault Settings Sync" section header to `src/settings.ts`
- [ ] 8.2 Add "Push Settings" button to settings tab — calls `pushSettings()` with confirmation modal
- [ ] 8.3 Add "Pull Settings" button to settings tab — calls `pullSettings()` with confirmation modal (includes restart warning)
- [ ] 8.4 Register `push-settings` command in `src/plugin.ts` — "Push vault settings to server"
- [ ] 8.5 Register `pull-settings` command in `src/plugin.ts` — "Pull vault settings from server"
- [ ] 8.6 Instantiate `SettingsSyncService` in `src/plugin.ts` and wire it to the commands and settings tab buttons

## 9. Testing & Verification

- [ ] 9.1 Verify server starts cleanly with the new migration — TypeScript compiles, drizzle-kit check passes
- [ ] 9.2 Test upsert setting via REST API — confirm response includes hash, extension, isBinary
- [ ] 9.3 Test list settings — confirm only active settings returned, tombstones excluded
- [ ] 9.4 Test get setting — confirm content returned for active setting, 404 for missing/tombstoned
- [ ] 9.5 Test delete setting — confirm soft-delete (expires_at set, content preserved)
- [ ] 9.6 Test delete all settings — confirm count returned, all active settings tombstoned
- [ ] 9.7 Test permission enforcement — confirm `settings_read`/`settings_write` required, `read`/`write` insufficient
- [ ] 9.8 Test client push — verify all eligible .obsidian/ files uploaded, excluded paths skipped
- [ ] 9.9 Test client pull — verify settings written to .obsidian/, local-only files deleted, excluded paths preserved
