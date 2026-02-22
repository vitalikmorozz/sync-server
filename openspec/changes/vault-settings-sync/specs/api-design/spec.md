## ADDED Requirements

### Requirement: List Settings

List all active settings files in the store. Returns metadata without content.

```
GET /settings
```

**Response:**

```json
{
  "settings": [
    {
      "path": "app.json",
      "hash": "sha256:abc123...",
      "size": 1024,
      "extension": "json",
      "isBinary": false,
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T14:30:00.000Z"
    },
    {
      "path": "plugins/obsidian-excalidraw-plugin/data.json",
      "hash": "sha256:def456...",
      "size": 2048,
      "extension": "json",
      "isBinary": false,
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T14:30:00.000Z"
    }
  ],
  "total": 42
}
```

Expired tombstones SHALL be cleaned up lazily when this endpoint is called (fire-and-forget, does not block the response).

**Required Permission:** `settings_read`

#### Scenario: List returns all active settings

- **WHEN** a request is made to `GET /api/v1/settings` with a valid API key that has `settings_read` permission
- **THEN** the response SHALL include all active (non-tombstoned) settings files for the store with their metadata

#### Scenario: List does not include tombstoned settings

- **WHEN** a settings file has been soft-deleted (has `expires_at` set)
- **THEN** it SHALL NOT appear in the list response

#### Scenario: List requires settings_read permission

- **WHEN** a request is made to `GET /api/v1/settings` with a key that has `read` but NOT `settings_read` permission
- **THEN** the server SHALL respond with `403 Forbidden`

### Requirement: Get Setting

Retrieve a specific settings file's content and metadata using its path as a query parameter.

```
GET /settings?path=app.json
```

**Response:**

```json
{
  "path": "app.json",
  "content": "{\"vimMode\": true, ...}",
  "hash": "sha256:abc123...",
  "size": 1024,
  "extension": "json",
  "isBinary": false,
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T14:30:00.000Z"
}
```

**Errors:**

- `404 Not Found` if the setting does not exist or is tombstoned

**Required Permission:** `settings_read`

#### Scenario: Get returns setting with content

- **WHEN** a request is made to `GET /api/v1/settings?path=app.json`
- **THEN** the response SHALL include the full content of the settings file along with its metadata

#### Scenario: Get returns 404 for missing setting

- **WHEN** a request is made to `GET /api/v1/settings?path=nonexistent.json`
- **THEN** the server SHALL respond with `404 Not Found`

#### Scenario: Get returns 404 for tombstoned setting

- **WHEN** a request is made to `GET /api/v1/settings?path=app.json` and `app.json` is tombstoned
- **THEN** the server SHALL respond with `404 Not Found`

### Requirement: Upsert Setting

Create or update a settings file. If the file does not exist (or is a tombstone), creates it. If it exists, updates the content. The server SHALL compute the hash, size, extension, and is_binary from the path and content.

```
PUT /settings
```

**Request Body:**

```json
{
  "path": "app.json",
  "content": "{\"vimMode\": true, ...}"
}
```

**Response:**

```json
{
  "path": "app.json",
  "hash": "sha256:abc123...",
  "size": 1024,
  "extension": "json",
  "isBinary": false,
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-16T09:00:00.000Z"
}
```

**Required Permission:** `settings_write`

#### Scenario: Upsert creates new setting

- **WHEN** a PUT request creates a settings file at path `hotkeys.json` that does not exist
- **THEN** the server SHALL create the row with the provided content, computed hash, and derived metadata

#### Scenario: Upsert updates existing setting

- **WHEN** a PUT request updates a settings file at path `app.json` that already exists
- **THEN** the server SHALL update the content, recompute the hash, and update `updated_at`

#### Scenario: Upsert resurrects tombstone

- **WHEN** a PUT request targets a path that has a tombstoned setting
- **THEN** the server SHALL reuse the existing row — clear `expires_at`, update content and metadata

### Requirement: Delete Setting

Soft-delete a single settings file by setting a 30-day tombstone. Content is preserved.

```
DELETE /settings?path=app.json
```

**Response:** `204 No Content`

**Required Permission:** `settings_write`

#### Scenario: Delete soft-deletes setting

- **WHEN** a DELETE request is made for `app.json`
- **THEN** the server SHALL set `expires_at` to `now() + 30 days` and preserve all other fields

#### Scenario: Delete returns 204 even if not found

- **WHEN** a DELETE request is made for a path that does not exist
- **THEN** the server SHALL respond with `204 No Content` (idempotent)

### Requirement: Delete All Settings

Soft-delete all active settings files in the store. Used by the client's push operation to clear server settings before re-uploading.

```
DELETE /settings/all
```

**Response:**

```json
{
  "deleted": 42
}
```

**Required Permission:** `settings_write`

#### Scenario: Delete all soft-deletes all active settings

- **WHEN** a DELETE request is made to `/api/v1/settings/all`
- **THEN** all active settings files for the store SHALL be tombstoned, and the response SHALL include the count of deleted files

#### Scenario: Delete all does not affect tombstoned settings

- **WHEN** some settings are already tombstoned and `DELETE /api/v1/settings/all` is called
- **THEN** only active (non-tombstoned) settings SHALL be affected; already-tombstoned settings are unchanged
