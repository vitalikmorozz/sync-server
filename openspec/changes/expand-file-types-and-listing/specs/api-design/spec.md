## MODIFIED Requirements

### Requirement: List Files

List files in the store with pagination. Optionally filter by path prefix, include soft-deleted tombstones, filter by extension, search content, match partial paths, and filter by binary status.

```
GET /files?limit=100&offset=0&path=notes/&include_deleted=false&extension=md&content_contains=recipe&path_contains=daily&is_binary=false
```

**Query Parameters:**

| Param              | Type   | Default | Description                                          |
| ------------------ | ------ | ------- | ---------------------------------------------------- |
| `path`             | string | —       | Filter by path prefix (optional)                     |
| `limit`            | number | 100     | Max results (1-1000)                                 |
| `offset`           | number | 0       | Pagination offset                                    |
| `include_deleted`  | string | "false" | Include tombstones ("true"/"false"/"1"/"0")          |
| `extension`        | string | —       | Filter by extension, comma-separated (optional)      |
| `content_contains` | string | —       | Case-insensitive content substring search (optional) |
| `path_contains`    | string | —       | Partial path matching anywhere in path (optional)    |
| `is_binary`        | string | —       | Filter by binary status ("true"/"false") (optional)  |

**Response:**

```json
{
  "files": [
    {
      "path": "notes/daily/2024-01-15.md",
      "hash": "sha256:abc123...",
      "size": 1024,
      "extension": "md",
      "isBinary": false,
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T14:30:00.000Z"
    },
    {
      "path": "images/photo.png",
      "hash": "sha256:def456...",
      "size": 204800,
      "extension": "png",
      "isBinary": true,
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T14:30:00.000Z"
    }
  ],
  "total": 42,
  "limit": 100,
  "offset": 0
}
```

The `expiresAt` field is only present on tombstoned files (soft-deleted). Active files do not include this field. The `extension` field is `null` for files with no extension. The `isBinary` field indicates whether the file is binary.

**Required Permission:** `read`

#### Scenario: List files with new fields in response

- **WHEN** a request is made to `GET /api/v1/files`
- **THEN** each file object in the response SHALL include `extension` (string or null) and `isBinary` (boolean) fields

#### Scenario: List files with extension filter

- **WHEN** a request is made to `GET /api/v1/files?extension=png,jpg`
- **THEN** the response SHALL include only files with extension `"png"` or `"jpg"`, and the `total` count SHALL reflect the filtered set

#### Scenario: List files with content search

- **WHEN** a request is made to `GET /api/v1/files?content_contains=hello`
- **THEN** the response SHALL include only non-binary files whose content contains `"hello"` (case-insensitive)

### Requirement: Get File

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
  "extension": "md",
  "isBinary": false,
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T14:30:00.000Z"
}
```

For binary files, `content` contains the base64-encoded string and `isBinary` is `true`.

**Required Permission:** `read`

#### Scenario: Get binary file returns base64 content

- **WHEN** a request is made to `GET /api/v1/files?path=images/photo.png`
- **THEN** the response SHALL include `"isBinary": true`, `"extension": "png"`, and `content` as a base64-encoded string

#### Scenario: Get text file returns plain content

- **WHEN** a request is made to `GET /api/v1/files?path=notes/daily.md`
- **THEN** the response SHALL include `"isBinary": false`, `"extension": "md"`, and `content` as plain text

### Requirement: Create File (Strict)

Create a new file. Fails with `409 Conflict` if a file already exists at the path.

**Response includes new fields:**

```json
{
  "path": "images/photo.png",
  "hash": "sha256:def456...",
  "size": 204800,
  "extension": "png",
  "isBinary": true,
  "createdAt": "2024-01-16T08:00:00.000Z",
  "updatedAt": "2024-01-16T08:00:00.000Z"
}
```

The server SHALL extract the extension from the path and determine `is_binary` status automatically. The client does not need to send these fields.

#### Scenario: Create binary file sets metadata automatically

- **WHEN** a POST request creates a file at path `images/photo.png` with base64 content
- **THEN** the response SHALL include `"extension": "png"` and `"isBinary": true`, derived from the path

### Requirement: Upsert File

Create or update a file with automatic binary metadata extraction.

The server SHALL update `extension` and `is_binary` on every upsert, derived from the file path. If a file is renamed to a different extension, the metadata updates accordingly.

#### Scenario: Upsert binary file

- **WHEN** a PUT request upserts a file at path `docs/manual.pdf` with base64 content
- **THEN** the response SHALL include `"extension": "pdf"` and `"isBinary": true`

### Requirement: Rename/Move File

Rename or move a file to a new path. The server SHALL update `extension` and `is_binary` based on the new path.

#### Scenario: Rename changes extension metadata

- **WHEN** a file is renamed from `photo.png` to `photo.jpg`
- **THEN** the server SHALL update `extension` to `"jpg"` (and `is_binary` remains `true`)
