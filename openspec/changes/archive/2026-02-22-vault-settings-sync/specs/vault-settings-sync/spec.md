## ADDED Requirements

### Requirement: Settings file storage in dedicated table

The server SHALL store vault settings files in a `settings` table that is structurally separate from the `files` table. Each settings file SHALL be scoped to a store via `store_id`. The path SHALL be relative to the `.obsidian/` folder (e.g., `app.json`, `plugins/obsidian-excalidraw-plugin/data.json`). Settings files SHALL have the same columns as content files: `id`, `store_id`, `path`, `content`, `hash`, `size`, `is_binary`, `extension`, `created_at`, `updated_at`, `expires_at`.

#### Scenario: Settings file stored with correct path

- **WHEN** a client pushes the file `.obsidian/app.json`
- **THEN** the server SHALL store it in the `settings` table with path `app.json`

#### Scenario: Plugin settings stored with nested path

- **WHEN** a client pushes the file `.obsidian/plugins/obsidian-excalidraw-plugin/data.json`
- **THEN** the server SHALL store it in the `settings` table with path `plugins/obsidian-excalidraw-plugin/data.json`

#### Scenario: Settings isolated from files

- **WHEN** a client requests `GET /api/v1/files`
- **THEN** the response SHALL NOT include any settings files from the `settings` table

### Requirement: Push settings (client to server)

The client SHALL provide a "Push Settings" command and UI button that uploads all local `.obsidian/` files to the server, replacing any existing server-stored settings for the store. The push operation SHALL:

1. Show a confirmation modal before proceeding
2. Soft-delete all existing settings on the server (via `DELETE /api/v1/settings/all`)
3. Read all files in `.obsidian/` recursively using the Obsidian adapter API (`vault.adapter.list()` and `vault.adapter.read()`)
4. Filter out excluded paths
5. Upload each file individually via `PUT /api/v1/settings`
6. Show a completion notice with the count of files uploaded

#### Scenario: Push uploads all eligible settings files

- **WHEN** the user triggers "Push Settings" and confirms
- **THEN** the client SHALL upload all files from `.obsidian/` (excluding `workspace.json`, `workspace-mobile.json`, and `plugins/sync-server/**`) to the server

#### Scenario: Push clears server settings first

- **WHEN** the user pushes settings
- **THEN** the client SHALL call `DELETE /api/v1/settings/all` before uploading, so that files deleted locally are also removed from the server

#### Scenario: Push requires confirmation

- **WHEN** the user clicks "Push Settings"
- **THEN** a confirmation modal SHALL appear warning that server settings will be overwritten

#### Scenario: Push shows completion notice

- **WHEN** the push completes successfully with 15 files uploaded
- **THEN** the client SHALL show a notice: "Settings pushed: 15 files uploaded"

### Requirement: Pull settings (server to client)

The client SHALL provide a "Pull Settings" command and UI button that downloads all server-stored settings and writes them to the local `.obsidian/` folder, replacing existing local settings. The pull operation SHALL:

1. Show a confirmation modal before proceeding (warning about restart requirement)
2. Fetch the settings list from the server via `GET /api/v1/settings`
3. For each setting, fetch content via `GET /api/v1/settings?path=...`
4. Write each file to the local `.obsidian/` folder via the adapter API
5. Delete local `.obsidian/` files that don't exist on the server (except excluded paths)
6. Show a completion notice recommending Obsidian restart

#### Scenario: Pull downloads all server settings

- **WHEN** the user triggers "Pull Settings" and confirms
- **THEN** the client SHALL download all settings files from the server and write them to the local `.obsidian/` folder

#### Scenario: Pull deletes local-only settings files

- **WHEN** the server has settings files `app.json` and `appearance.json`, but the local `.obsidian/` also has `hotkeys.json` (not on server)
- **THEN** the client SHALL delete the local `hotkeys.json` after pulling (it was not present on the server, meaning it was removed)

#### Scenario: Pull does not delete excluded paths

- **WHEN** the server has no `workspace.json` stored (because it's excluded from push)
- **THEN** the client SHALL NOT delete the local `workspace.json` during pull

#### Scenario: Pull requires confirmation with restart warning

- **WHEN** the user clicks "Pull Settings"
- **THEN** a confirmation modal SHALL appear warning that local settings will be overwritten and Obsidian will need to be restarted

#### Scenario: Pull shows restart notice

- **WHEN** the pull completes successfully
- **THEN** the client SHALL show a notice: "Settings pulled: N files updated. Restart Obsidian for changes to take effect."

### Requirement: Excluded paths

The client SHALL exclude the following paths from both push and pull operations. These paths SHALL be hardcoded and not configurable.

| Excluded Path            | Reason                                       |
| ------------------------ | -------------------------------------------- |
| `workspace.json`         | Device-specific window/pane layout           |
| `workspace-mobile.json`  | Device-specific mobile layout                |
| `plugins/sync-server/**` | The sync plugin itself (circular dependency) |

#### Scenario: Sync plugin excluded from push

- **WHEN** the client pushes settings
- **THEN** all files under `.obsidian/plugins/sync-server/` SHALL be excluded from the upload

#### Scenario: Sync plugin excluded from pull deletion

- **WHEN** the client pulls settings and the server has no `plugins/sync-server/` files
- **THEN** the client SHALL NOT delete the local `.obsidian/plugins/sync-server/` directory

#### Scenario: Workspace files excluded from push

- **WHEN** the client pushes settings
- **THEN** `workspace.json` and `workspace-mobile.json` SHALL NOT be uploaded

### Requirement: Settings soft-delete uses tombstone pattern

Settings files SHALL use the same soft-delete pattern as content files. When a settings file is deleted, `expires_at` SHALL be set to `now() + 30 days` and content SHALL be preserved. Expired tombstones SHALL be cleaned up lazily during list operations.

#### Scenario: Deleted setting becomes tombstone

- **WHEN** a settings file is deleted via `DELETE /api/v1/settings?path=app.json`
- **THEN** the row SHALL remain in the database with `expires_at` set 30 days in the future, and `content`, `hash`, `size` SHALL be preserved

#### Scenario: Tombstone resurrected on re-push

- **WHEN** a settings file `app.json` was previously deleted (tombstoned) and the client pushes a new version
- **THEN** the existing row SHALL be reused — `expires_at` cleared to `null`, content updated with the new version

#### Scenario: Expired tombstones cleaned up

- **WHEN** a settings list request is made and some tombstones have `expires_at < now()`
- **THEN** the server SHALL delete those expired rows as a fire-and-forget cleanup

### Requirement: Settings hash computation

The server SHALL compute SHA-256 content hashes for settings files using the same format as content files: `sha256:{64-char hex}` (71 chars total). The hash SHALL be computed on the stored content string.

#### Scenario: Hash computed on upsert

- **WHEN** a settings file is created or updated via `PUT /api/v1/settings`
- **THEN** the server SHALL compute the SHA-256 hash of the content and store it in the `hash` column

#### Scenario: Hash format matches files convention

- **WHEN** a settings file hash is computed
- **THEN** the hash SHALL be in the format `sha256:` followed by 64 lowercase hex characters
