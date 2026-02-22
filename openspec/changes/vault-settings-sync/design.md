## Context

Obsidian stores all vault configuration in a `.obsidian/` folder within the vault root. This includes core settings (`app.json`, `appearance.json`), plugin configurations (`plugins/<name>/data.json`), plugin executables (`plugins/<name>/main.js`), CSS snippets, themes, and hotkey bindings. The existing file sync system uses Obsidian's `vault.getFiles()` which explicitly excludes `.obsidian/`, meaning settings are never synchronized.

Users who use Obsidian across multiple devices must manually replicate settings on each device. This is tedious for hotkeys and appearance, and error-prone for plugin configurations.

The server already has a well-established pattern for file storage, soft-delete tombstones, authentication, and permissions that we can mirror for settings.

## Goals / Non-Goals

**Goals:**

- Store vault settings files in a dedicated database table, completely separate from content files
- Provide REST endpoints for settings CRUD, following the same patterns as file endpoints
- Add `settings_read` and `settings_write` permission values so settings access can be independently controlled
- Provide manual push/pull controls in the client plugin — push uploads local settings to server, pull downloads server settings to local
- Exclude device-specific files (`workspace.json`, `workspace-mobile.json`) and the sync plugin itself (`plugins/sync-server/`)
- Use the same soft-delete tombstone pattern as files (content preserved, 30-day expiry)

**Non-Goals:**

- Real-time settings synchronization via Socket.IO (too complex; settings changes often require Obsidian restart)
- Automatic/scheduled push or pull
- Selective per-file push/pull (it's all-or-nothing for now)
- Merging settings from different devices (push = client wins entirely, pull = server wins entirely)
- Syncing the sync plugin itself (would create circular dependency)
- A configurable exclusion list (hardcoded for now; could be added later)

## Decisions

### 1. Separate `settings` table vs reusing `files` table

**Decision:** Create a new `settings` table that mirrors the `files` table structure.

**Rationale:** The proposal explicitly requires settings to be stored completely separately from file content. A separate table provides:

- Clean isolation — settings never appear in file listing/search endpoints
- Independent tombstone cleanup cycles
- Clear conceptual boundary between vault content and vault configuration

**Alternative considered:** Reusing the `files` table with a `type` column or path prefix convention (e.g., `__settings__/app.json`). Rejected because it pollutes file queries, requires filtering in every file endpoint, and breaks the existing assumption that all files are vault content.

### 2. Permission naming: `settings_read` / `settings_write`

**Decision:** Add two new enum values: `settings_read` and `settings_write`, using snake_case to match database conventions.

**Rationale:** Separate permissions allow administrators to grant settings sync independently from file sync. A read-only client might need file access but not settings, or vice versa. The `permission` PostgreSQL enum supports adding values via `ALTER TYPE ... ADD VALUE`.

**Alternative considered:** A single `settings` permission covering both read and write. Rejected for consistency with the existing `read`/`write` split and to allow read-only settings access (useful for backup or audit scenarios).

### 3. REST-only, no Socket.IO events for settings

**Decision:** Settings sync uses only REST endpoints. No `settings-created` or `settings-modified` events are broadcast.

**Rationale:** Settings changes (especially plugin installs, theme changes) typically require an Obsidian restart to take effect. Real-time sync would create confusion — a user would see a notification about settings changing but nothing would visually update until restart. Manual push/pull with an explicit restart notice is a better UX.

### 4. Push/pull are full replacements, not incremental

**Decision:** Push deletes all server settings then uploads all local files. Pull downloads all server files and overwrites local ones, deleting local-only files.

**Rationale:** Settings files are interdependent (e.g., `community-plugins.json` lists enabled plugins, but the actual plugin code lives in `plugins/<name>/`). Partial sync could leave settings in an inconsistent state. Full replacement is simpler, more predictable, and matches user expectations — "make the other side match this side."

**Alternative considered:** Per-file hash comparison with last-edit-wins (like the file sync Phase 3). Rejected because settings aren't independently meaningful and the added complexity isn't warranted for a manual operation.

### 5. Client reads `.obsidian/` via the adapter API

**Decision:** Use `this.app.vault.adapter.list()` for directory enumeration and `adapter.read()` / `adapter.readBinary()` for file contents. Paths are relative to the vault root, so `.obsidian/app.json` is the literal path string.

**Rationale:** `vault.getFiles()` excludes `.obsidian/` by design. The `DataAdapter` interface provides raw filesystem access without the filtering. This is the standard Obsidian API for accessing config files — no native module hacks needed.

### 6. Settings path format

**Decision:** Store paths relative to `.obsidian/`, e.g., `app.json`, `plugins/obsidian-excalidraw-plugin/data.json`, `snippets/my-style.css`.

**Rationale:** The `.obsidian/` prefix is implicit and constant — storing it would waste space and require stripping on every read/write. Relative paths are shorter and more readable in API responses.

### 7. Plugin files are stored as text, not binary

**Decision:** All `.obsidian/` files are stored as plain text content, even `main.js` bundles. No base64 encoding is used for settings files.

**Rationale:** Plugin `main.js` files are JavaScript source text (UTF-8), not true binary. Similarly, `data.json`, `manifest.json`, `styles.css` are all text formats. While `main.js` files can be large (several MB), they're valid UTF-8 strings. This avoids the base64 overhead and keeps the code simpler. The `is_binary` column will be set based on extension detection (same logic as files), but content will always be stored as text.

### 8. Excluded paths are hardcoded

**Decision:** The exclusion list (`workspace.json`, `workspace-mobile.json`, `plugins/sync-server/`) is hardcoded in the client plugin, not configurable.

**Rationale:** These exclusions are fundamental — `workspace.json` is always device-specific, and the sync plugin can never sync itself. A configurable exclusion list adds UI complexity and edge cases (what if a user excludes everything?). Can be added later if users request it.

## Risks / Trade-offs

**[Large payload size]** Plugin `main.js` files can be several MB each. A vault with many plugins could mean a push/pull transfers 50-100MB of data.
→ Mitigation: One-by-one uploads (not a single bulk request) prevent memory spikes. Individual failures don't abort the entire operation. Future optimization: hash comparison to skip unchanged files.

**[Obsidian restart required after pull]** After pulling settings, most changes won't take effect until Obsidian is restarted (especially plugin changes, hotkeys, appearance).
→ Mitigation: Show explicit notice after pull: "Settings updated. Restart Obsidian for changes to take effect."

**[No conflict resolution]** Push blindly overwrites server; pull blindly overwrites local. If two devices push different settings, the last push wins with no way to recover the overwritten version.
→ Mitigation: Soft-delete preserves tombstoned settings for 30 days. Future improvement: show a diff or timestamp comparison before overwriting.

**[Permission enum migration]** Adding values to a PostgreSQL enum requires `ALTER TYPE ... ADD VALUE` which cannot run inside a transaction in PostgreSQL < 12. Our minimum is PostgreSQL 15+, so this is not an issue. However, the migration is irreversible — enum values cannot be removed once added.
→ Mitigation: Use clear, permanent names (`settings_read`, `settings_write`). No rollback concern since the values are additive.

**[Adapter API stability]** The `DataAdapter` interface (`list()`, `read()`, `readBinary()`) is part of Obsidian's public API but is less commonly documented than the `Vault` API. Breaking changes are unlikely but possible.
→ Mitigation: Wrap adapter calls in a utility function that can be updated if the API changes.

## Migration Plan

1. Generate Drizzle migration `0003_*` to:
   - `ALTER TYPE "permission" ADD VALUE 'settings_read'`
   - `ALTER TYPE "permission" ADD VALUE 'settings_write'`
   - `CREATE TABLE settings` with all columns and indexes
2. Migration runs automatically on server startup (existing pattern)
3. No data backfill needed — the table starts empty
4. Existing API keys are unaffected — they simply don't have the new permissions
5. Admin must update existing keys (or create new ones) to include `settings_read`/`settings_write` for settings sync to work
6. Client plugin rebuild + Obsidian restart required to pick up new push/pull UI

**Rollback:** Drop the `settings` table. Enum values (`settings_read`, `settings_write`) cannot be removed from PostgreSQL but are harmless if unused — they would simply be ignored by the code.

## Open Questions

_None — all decisions resolved during proposal discussion._
