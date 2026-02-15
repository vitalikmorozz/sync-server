# REST API Design

## Overview

The REST API provides endpoints for file management and administrative operations. All endpoints except `/health` require API key authentication via the `X-API-Key` header.

Write operations on files also broadcast Socket.IO events to the store room, so connected clients are notified of changes made via REST.

## Base URL

```
http://{host}:{port}/api/v1
```

## Authentication

All requests must include the `X-API-Key` header:

```
X-API-Key: sk_store_xxxxxxxxxxxxxxxxxxxx
```

- **Store keys** (`sk_store_*`): Authenticate against the `api_keys` table. The key is hashed with SHA-256 and matched. Grants access scoped to the key's store with the key's permissions.
- **Admin keys** (`sk_admin_*`): Validated against the `ADMIN_API_KEY` environment variable. Required for admin endpoints.

Invalid or missing keys return `401 Unauthorized`.

## Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

### Error Codes

| Code               | HTTP Status | Description                 |
| ------------------ | ----------- | --------------------------- |
| `UNAUTHORIZED`     | 401         | Missing or invalid API key  |
| `FORBIDDEN`        | 403         | Insufficient permissions    |
| `NOT_FOUND`        | 404         | Resource not found          |
| `VALIDATION_ERROR` | 400         | Invalid request body/params |
| `CONFLICT`         | 409         | Resource already exists     |
| `INTERNAL_ERROR`   | 500         | Server error                |

---

## File Endpoints

All file endpoints require store-level authentication (`X-API-Key` header with a store-scoped key).

### List Files

List files in the store with pagination. Optionally filter by path prefix and include soft-deleted tombstones.

```
GET /files?limit=100&offset=0&path=notes/&include_deleted=false
```

**Query Parameters:**

| Param             | Type   | Default | Description                                 |
| ----------------- | ------ | ------- | ------------------------------------------- |
| `path`            | string | —       | Filter by path prefix (optional)            |
| `limit`           | number | 100     | Max results (1-1000)                        |
| `offset`          | number | 0       | Pagination offset                           |
| `include_deleted` | string | "false" | Include tombstones ("true"/"false"/"1"/"0") |

**Response:**

```json
{
  "files": [
    {
      "path": "notes/daily/2024-01-15.md",
      "hash": "sha256:abc123...",
      "size": 1024,
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T14:30:00.000Z"
    },
    {
      "path": "notes/archived.md",
      "hash": "sha256:e3b0c4...",
      "size": 0,
      "createdAt": "2024-01-10T08:00:00.000Z",
      "updatedAt": "2024-01-14T12:00:00.000Z",
      "expiresAt": "2024-02-13T12:00:00.000Z"
    }
  ],
  "total": 42,
  "limit": 100,
  "offset": 0
}
```

The `expiresAt` field is only present on tombstoned files (soft-deleted). Active files do not include this field.

**Required Permission:** `read`

---

### Get File

Retrieve a specific file's content and metadata using its path as a query parameter.

```
GET /files?path=notes/daily/2024-01-15.md
```

When the `path` query parameter is provided **without** `limit` or `offset`, the endpoint returns a single file with its content.

**Response:**

```json
{
  "path": "notes/daily/2024-01-15.md",
  "content": "# Daily Note\n\nToday's tasks...",
  "hash": "sha256:abc123...",
  "size": 1024,
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T14:30:00.000Z"
}
```

**Errors:**

- `404 Not Found` if file does not exist

**Required Permission:** `read`

---

### Create File (Strict)

Create a new file. Fails with `409 Conflict` if a file already exists at the path.

```
POST /files
```

**Request Body:**

```json
{
  "path": "notes/daily/2024-01-16.md",
  "content": "# New Daily Note\n\n..."
}
```

**Response:** `201 Created`

```json
{
  "path": "notes/daily/2024-01-16.md",
  "hash": "sha256:def456...",
  "size": 512,
  "createdAt": "2024-01-16T08:00:00.000Z",
  "updatedAt": "2024-01-16T08:00:00.000Z"
}
```

**Errors:**

- `409 Conflict` if file already exists at the path

**Broadcasts:** `file-created` to the store room.

**Required Permission:** `write`

---

### Upsert File

Create or update a file. If the file does not exist (or is a tombstone), creates it. If it exists, updates the content.

```
PUT /files
```

**Request Body:**

```json
{
  "path": "notes/daily/2024-01-15.md",
  "content": "# Updated content\n\n..."
}
```

**Response:**

```json
{
  "path": "notes/daily/2024-01-15.md",
  "hash": "sha256:ghi789...",
  "size": 768,
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-16T09:00:00.000Z"
}
```

**Broadcasts:** `file-created` (if new) or `file-modified` (if updated) to the store room.

**Required Permission:** `write`

---

### Delete File

Soft-delete a file by setting a 30-day tombstone. Content is cleared from the database.

```
DELETE /files?path=notes/daily/2024-01-15.md
```

**Response:** `204 No Content`

**Broadcasts:** `file-deleted` to the store room (if the file existed).

**Required Permission:** `write`

---

### Delete All Files

Soft-delete all files in the store. Used by the client's "Force push" feature to clear the server before re-uploading.

```
DELETE /files/all
```

**Response:**

```json
{
  "deleted": 42
}
```

**Required Permission:** `write`

---

### Rename/Move File

Rename or move a file to a new path.

```
PATCH /files
```

**Request Body:**

```json
{
  "path": "notes/daily/2024-01-15.md",
  "newPath": "archive/2024/daily-2024-01-15.md"
}
```

**Response:**

```json
{
  "path": "archive/2024/daily-2024-01-15.md",
  "hash": "sha256:abc123...",
  "size": 1024,
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-16T10:00:00.000Z"
}
```

**Broadcasts:** `file-renamed` to the store room. If the source file does not exist, creates an empty file at the new path and broadcasts `file-created` instead.

**Required Permission:** `write`

---

## Admin Endpoints

Admin endpoints require the master API key (`ADMIN_API_KEY` env var) with the `sk_admin_` prefix.

### List Stores

```
GET /admin/stores
```

**Response:**

```json
{
  "stores": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "My Vault",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "fileCount": 150,
      "totalSize": 5242880
    }
  ]
}
```

---

### Get Store

```
GET /admin/stores/{storeId}
```

**Response:** Same as a single entry from list stores, with `fileCount` and `totalSize`.

---

### Create Store

```
POST /admin/stores
```

**Request Body:**

```json
{
  "name": "Work Notes"
}
```

**Response:** `201 Created`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Work Notes",
  "createdAt": "2024-01-16T12:00:00.000Z",
  "updatedAt": "2024-01-16T12:00:00.000Z"
}
```

---

### Delete Store

```
DELETE /admin/stores/{storeId}
```

Deletes the store and all its files and API keys (cascade).

**Response:** `204 No Content`

---

### List API Keys

```
GET /admin/stores/{storeId}/keys
```

**Response:**

```json
{
  "keys": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Obsidian Desktop",
      "permissions": ["read", "write"],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "lastUsedAt": "2024-01-16T08:00:00.000Z",
      "prefix": "sk_store_550e84"
    }
  ]
}
```

Full key values are only shown once at creation time.

---

### Get API Key

```
GET /admin/stores/{storeId}/keys/{keyId}
```

**Response:** Same as a single entry from list API keys.

---

### Create API Key

```
POST /admin/stores/{storeId}/keys
```

**Request Body:**

```json
{
  "name": "Obsidian Mobile",
  "permissions": ["read", "write"]
}
```

**Response:** `201 Created`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "name": "Obsidian Mobile",
  "key": "sk_store_550e84_xK9mN2pL5qR8tU1wY4zA7cE0fH3jB6",
  "permissions": ["read", "write"],
  "createdAt": "2024-01-16T12:00:00.000Z",
  "lastUsedAt": null,
  "prefix": "sk_store_550e84"
}
```

**Important:** The full `key` value is only returned once at creation. Store it securely.

---

### Revoke API Key

Soft-delete: sets `revokedAt` timestamp. The key can no longer be used for authentication.

```
DELETE /admin/stores/{storeId}/keys/{keyId}
```

**Response:** `204 No Content`

---

## Health Endpoint

### Health Check

```
GET /health
```

No authentication required.

**Response (200 OK):**

```json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime": 86400,
  "database": "connected"
}
```

**Response (503 Service Unavailable):**

```json
{
  "status": "degraded",
  "version": "0.1.0",
  "uptime": 86400,
  "database": "disconnected"
}
```
