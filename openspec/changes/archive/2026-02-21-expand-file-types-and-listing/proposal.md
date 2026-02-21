## Why

Obsidian saves pasted images and attachments as local files alongside markdown notes. The sync system currently skips all binary files (images, PDFs, etc.) via a hardcoded exclusion list in the client, meaning users lose attachments when syncing across devices. Additionally, the file listing API only supports basic prefix-based path filtering, making it impossible to query files by extension or search content — capabilities needed for building useful views over synced data (e.g., "find all recipe notes tagged as 'Want to try'").

## What Changes

### Binary/Image File Sync

- Remove the hardcoded `BINARY_EXTENSIONS` skip list in the client plugin that excludes 55+ file types from sync
- Add base64 encoding/decoding for binary file content on the client side before send/after receive
- Add `is_binary` (boolean) and `extension` (text) columns to the `files` database table
- Server stores binary content as base64-encoded text in the existing `content` column
- Socket.IO events carry base64-encoded content for binary files (within existing 10MB payload limit)
- Content hashing (SHA-256) operates on raw bytes for binary files, not the base64 string
- **BREAKING**: Clients must be updated to handle base64 content for binary files; older clients will see corrupted content for binary files synced by updated clients

### Advanced File Listing Filters

- Add `extension` query parameter to `GET /api/v1/files` to filter by file extension (e.g., `?extension=md`, `?extension=png`)
- Add `content_contains` query parameter for case-insensitive content substring search (e.g., `?content_contains=status: Want to try`)
- Add `path_contains` query parameter for partial path matching anywhere in the path (complementing existing prefix-based `path` param)
- Add `is_binary` query parameter to filter binary vs text files
- Update `listFilesQuerySchema` and `listFilesWithPagination()` to support new filters

## Capabilities

### New Capabilities

- `binary-file-sync`: Binary file detection, base64 encoding/decoding, and end-to-end sync for images, PDFs, and other non-text files. Covers both client-side encoding and server-side storage.
- `file-listing-filters`: Advanced query parameters for the file listing endpoint — extension filtering, content search, partial path matching, and binary/text filtering.

### Modified Capabilities

- `api-design`: New query parameters on GET `/api/v1/files` endpoint; response shape gains `is_binary` and `extension` fields.
- `database-schema`: New columns (`is_binary`, `extension`) on the `files` table; migration required.
- `realtime-sync`: Socket.IO event payloads carry base64-encoded content for binary files; clients must detect and decode. Content hash computation changes for binary files.

## Impact

- **Database**: Migration adds `is_binary` (boolean, default false) and `extension` (text, nullable) columns to the `files` table. Existing rows default to `is_binary = false`. Index on `extension` column for filter performance.
- **REST API**: GET `/api/v1/files` gains 4 new optional query params. Response objects include `is_binary` and `extension` fields. Non-breaking for existing consumers (new fields are additive, new params are optional).
- **WebSocket protocol**: Binary file content is base64-encoded in `file-modified`, `file-created`, and `file-renamed` events. This is a semantic change — clients must detect `is_binary` and decode accordingly.
- **Client plugin**: Major changes to `src/utils.ts` (remove skip list, add encoding), `src/handlers.ts` (decode on receive), `src/sync.ts` (encode on send). The `isBinaryFile()` function changes from "should skip" to "needs base64 encoding".
- **Storage**: Base64 encoding inflates binary content by ~33%. A 5MB image becomes ~6.7MB stored. The existing 10MB content limit effectively caps binary files at ~7.5MB original size.
- **Performance**: Content search (`content_contains`) uses SQL `ILIKE` which may be slow on large datasets. Consider PostgreSQL trigram index (`pg_trgm`) as a future optimization if needed.
