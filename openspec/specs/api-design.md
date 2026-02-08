# REST API Design

## Overview

The REST API provides endpoints for file management and administrative operations. All endpoints require API key authentication via the `X-API-Key` header.

## Base URL

```
http://{host}:{port}/api/v1
```

## Authentication

All requests must include the `X-API-Key` header:

```
X-API-Key: sk_store_xxxxxxxxxxxxxxxxxxxx
```

The API key encodes the store ID and permissions. Invalid or missing keys return `401 Unauthorized`.

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

### List Files

List all files in the store.

```
GET /files
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `path` | string | Filter by path prefix (optional) |
| `limit` | number | Max results (default: 100, max: 1000) |
| `offset` | number | Pagination offset (default: 0) |

**Response:**

```json
{
  "files": [
    {
      "path": "notes/daily/2024-01-15.md",
      "hash": "sha256:abc123...",
      "size": 1024,
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T14:30:00Z"
    }
  ],
  "total": 42,
  "limit": 100,
  "offset": 0
}
```

**Required Permission:** `read`

---

### Get File

Retrieve a specific file's content and metadata.

```
GET /files/{path}
```

**Path Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `path` | string | URL-encoded file path |

**Response:**

```json
{
  "path": "notes/daily/2024-01-15.md",
  "content": "# Daily Note\n\nToday's tasks...",
  "hash": "sha256:abc123...",
  "size": 1024,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T14:30:00Z"
}
```

**Required Permission:** `read`

---

### Create File

Create a new file.

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
  "createdAt": "2024-01-16T08:00:00Z",
  "updatedAt": "2024-01-16T08:00:00Z"
}
```

**Errors:**

- `409 Conflict` if file already exists

**Required Permission:** `write`

---

### Update File

Update an existing file's content.

```
PUT /files/{path}
```

**Request Body:**

```json
{
  "content": "# Updated content\n\n..."
}
```

**Response:**

```json
{
  "path": "notes/daily/2024-01-15.md",
  "hash": "sha256:ghi789...",
  "size": 768,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-16T09:00:00Z"
}
```

**Required Permission:** `write`

---

### Delete File

Delete a file.

```
DELETE /files/{path}
```

**Response:** `204 No Content`

**Required Permission:** `write`

---

### Rename/Move File

Rename or move a file to a new path.

```
PATCH /files/{path}
```

**Request Body:**

```json
{
  "newPath": "archive/2024/daily-2024-01-15.md"
}
```

**Response:**

```json
{
  "path": "archive/2024/daily-2024-01-15.md",
  "hash": "sha256:abc123...",
  "size": 1024,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-16T10:00:00Z"
}
```

**Required Permission:** `write`

---

## Admin Endpoints

Admin endpoints require a master API key with `admin` permission.

### List Stores

```
GET /admin/stores
```

**Response:**

```json
{
  "stores": [
    {
      "id": "store_abc123",
      "name": "My Vault",
      "createdAt": "2024-01-01T00:00:00Z",
      "fileCount": 150,
      "totalSize": 5242880
    }
  ]
}
```

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
  "id": "store_def456",
  "name": "Work Notes",
  "createdAt": "2024-01-16T12:00:00Z"
}
```

---

### Delete Store

```
DELETE /admin/stores/{storeId}
```

Deletes the store and all its files.

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
      "id": "key_abc123",
      "name": "Obsidian Desktop",
      "permissions": ["read", "write"],
      "createdAt": "2024-01-01T00:00:00Z",
      "lastUsedAt": "2024-01-16T08:00:00Z",
      "prefix": "sk_store_abc1"
    }
  ]
}
```

Note: Full key values are only shown once at creation time.

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
  "id": "key_xyz789",
  "name": "Obsidian Mobile",
  "key": "sk_store_xyz789_xxxxxxxxxxxxxxxxxxxxxxxx",
  "permissions": ["read", "write"],
  "createdAt": "2024-01-16T12:00:00Z"
}
```

**Important:** The full `key` value is only returned once. Store it securely.

---

### Revoke API Key

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

**Response:**

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400
}
```
