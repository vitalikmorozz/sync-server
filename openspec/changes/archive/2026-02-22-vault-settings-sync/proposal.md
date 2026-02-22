## Why

Users who work across multiple devices must manually configure each Obsidian instance — hotkeys, themes, plugin settings, appearance, enabled plugins. The `.obsidian/` configuration folder is invisible to the existing file sync system (`vault.getFiles()` excludes it), so there is no way to keep vault settings consistent across clients. Adding dedicated settings synchronization removes this friction.

## What Changes

- Add a new `settings` database table (mirrors `files` table structure) to store vault configuration files separately from content files
- Add new `settings_read` and `settings_write` permission values to the PostgreSQL `permission` enum, allowing fine-grained access control for settings operations
- Add REST API endpoints under `/api/v1/settings` for listing, reading, upserting, and deleting settings files (no real-time Socket.IO events — settings sync is manual only)
- Add "Push Settings" and "Pull Settings" UI controls to the client plugin settings tab, plus corresponding commands
- Push overwrites server settings with local `.obsidian/` files; pull overwrites local settings with server-stored files
- Settings files use the same soft-delete tombstone pattern as regular files (content preserved, `expires_at` set)
- Excluded from sync: `workspace.json`, `workspace-mobile.json`, and `plugins/sync-server/**` (the sync plugin itself)
- No real-time broadcasting — settings changes are not emitted via Socket.IO events

## Capabilities

### New Capabilities

- `vault-settings-sync`: Core settings synchronization capability — settings table design, CRUD service layer, push/pull semantics, file exclusion rules, and client-side `.obsidian/` reading/writing via the Obsidian adapter API

### Modified Capabilities

- `database-schema`: New `settings` table with indexes, extension of the `permission` enum with `settings_read` and `settings_write` values, new migration
- `api-design`: New REST endpoints under `/api/v1/settings` for settings file CRUD operations
- `security-model`: New permission values (`settings_read`, `settings_write`) and their authorization rules

## Impact

**Server:**

- New database table and migration (`0003_*`)
- New schema file (`src/db/schema/settings.ts`), service (`src/services/settings.ts`), routes (`src/routes/settings.ts`), Zod schemas
- Modified permission enum in schema and validation layers
- Route registration in `src/routes/index.ts`

**Client plugin:**

- New settings sync service (`src/settingsSync.ts`)
- Modified settings tab UI (`src/settings.ts`) — push/pull buttons
- Modified plugin entry (`src/plugin.ts`) — new commands
- Modified types (`src/types.ts`) — settings response types
- Uses `vault.adapter.list()` and `vault.adapter.read()`/`readBinary()` to access `.obsidian/` files (outside normal vault file scope)

**API keys:**

- Existing keys are unaffected (they won't have settings permissions until explicitly granted)
- Admin must grant `settings_read`/`settings_write` to keys that need settings sync
