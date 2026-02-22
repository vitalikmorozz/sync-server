## MODIFIED Requirements

### Requirement: Permission Types

| Permission       | Description               | Allows                                       |
| ---------------- | ------------------------- | -------------------------------------------- |
| `read`           | Read-only file access     | List files, get file content, receive events |
| `write`          | Write file access         | Create, update, delete, rename files         |
| `settings_read`  | Read-only settings access | List settings, get setting content           |
| `settings_write` | Write settings access     | Create, update, delete settings              |

#### Scenario: Key with settings_read can list settings

- **WHEN** a request is made to `GET /api/v1/settings` with a key that has `settings_read` permission
- **THEN** the server SHALL allow the request

#### Scenario: Key without settings_read cannot list settings

- **WHEN** a request is made to `GET /api/v1/settings` with a key that has `read` but NOT `settings_read` permission
- **THEN** the server SHALL respond with `403 Forbidden`

#### Scenario: Key with settings_write can upsert settings

- **WHEN** a request is made to `PUT /api/v1/settings` with a key that has `settings_write` permission
- **THEN** the server SHALL allow the request

#### Scenario: Key without settings_write cannot delete settings

- **WHEN** a request is made to `DELETE /api/v1/settings?path=app.json` with a key that has `write` but NOT `settings_write` permission
- **THEN** the server SHALL respond with `403 Forbidden`

### Requirement: Permission Combinations

| Permissions                                            | Use Case                                    |
| ------------------------------------------------------ | ------------------------------------------- |
| `["read"]`                                             | Read-only client, backup systems            |
| `["write"]`                                            | Write-only ingestion (unusual)              |
| `["read", "write"]`                                    | File sync only (no settings)                |
| `["read", "write", "settings_read", "settings_write"]` | Full access client (typical Obsidian usage) |
| `["settings_read"]`                                    | Settings backup / audit only                |
| `["settings_read", "settings_write"]`                  | Settings sync only (no file sync)           |

#### Scenario: Existing keys unaffected by new permissions

- **WHEN** the migration adds `settings_read` and `settings_write` to the permission enum
- **THEN** existing API keys SHALL retain their current permissions array unchanged — they will NOT automatically gain settings permissions

#### Scenario: Full access key created with all permissions

- **WHEN** an admin creates an API key with permissions `["read", "write", "settings_read", "settings_write"]`
- **THEN** the key SHALL be able to access both file and settings endpoints

#### Scenario: Admin key creation accepts new permission values

- **WHEN** an admin creates an API key via `POST /api/v1/admin/stores/:storeId/keys` with `"permissions": ["read", "write", "settings_read", "settings_write"]`
- **THEN** the server SHALL validate and accept the new permission values
