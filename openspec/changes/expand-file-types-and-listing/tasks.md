## 1. Database Migration & Schema

- [ ] 1.1 Add `is_binary` (boolean NOT NULL DEFAULT false) and `extension` (text, nullable) columns to the `files` Drizzle schema in `src/db/schema/files.ts`
- [ ] 1.2 Add `files_extension_idx` btree index on `(store_id, extension)` to the schema
- [ ] 1.3 Generate Drizzle migration with `drizzle-kit generate`
- [ ] 1.4 Add SQL to the migration to backfill `extension` from `path` for existing rows (extract extension, lowercase, no dot; null for no extension)
- [ ] 1.5 Verify migration runs cleanly on a fresh database and on a database with existing data

## 2. Server Binary Detection Utility

- [ ] 2.1 Create a server-side utility module (`src/utils/binary.ts` or similar) with a `BINARY_EXTENSIONS` set and helper functions: `extractExtension(path): string | null` and `isBinaryExtension(extension: string | null): boolean`
- [ ] 2.2 Ensure extension extraction handles edge cases: no extension, dotfiles (`.gitignore`), multiple dots (`file.test.md`), case normalization (uppercase → lowercase)

## 3. Server File Service Layer

- [ ] 3.1 Update `createFile` service to extract `extension` and `is_binary` from the path and persist them
- [ ] 3.2 Update `upsertFile` service to extract `extension` and `is_binary` from the path and persist them
- [ ] 3.3 Update `renameFile` service to recompute `extension` and `is_binary` from the new path
- [ ] 3.4 Update `softDeleteFile` to preserve `extension` and `is_binary` on tombstones (no change needed if columns aren't cleared)
- [ ] 3.5 Update `listFilesWithPagination` to include `is_binary` and `extension` in the SELECT and response mapping

## 4. File Listing Filters

- [ ] 4.1 Update `listFilesQuerySchema` in `src/schemas/index.ts` to add optional params: `extension` (string), `content_contains` (string), `path_contains` (string), `is_binary` (enum "true"/"false")
- [ ] 4.2 Update `listFilesWithPagination` in `src/services/files.ts` to build WHERE clauses for `extension` filter (comma-separated → `IN` query, case-insensitive)
- [ ] 4.3 Add `content_contains` filter: `WHERE content ILIKE '%term%' AND is_binary = false` (auto-exclude binary)
- [ ] 4.4 Add `path_contains` filter: `WHERE path LIKE '%term%'` (case-sensitive)
- [ ] 4.5 Add `is_binary` filter: `WHERE is_binary = true/false`
- [ ] 4.6 Ensure all new filters compose correctly with existing `path` prefix filter, `include_deleted`, `limit`, `offset`
- [ ] 4.7 Ensure `total` count query applies the same filters

## 5. REST API Response Updates

- [ ] 5.1 Update file list response mapping in `src/routes/files.ts` to include `isBinary` and `extension` fields
- [ ] 5.2 Update single file (get file) response to include `isBinary` and `extension` fields
- [ ] 5.3 Update create file response to include `isBinary` and `extension` fields
- [ ] 5.4 Update upsert file response to include `isBinary` and `extension` fields
- [ ] 5.5 Update rename file response to include `isBinary` and `extension` fields

## 6. Socket.IO Event Updates (Server)

- [ ] 6.1 Update `file-created` broadcast payload to include `isBinary` and `extension` fields
- [ ] 6.2 Update `file-modified` broadcast payload to include `isBinary` and `extension` fields
- [ ] 6.3 Update `file-renamed` broadcast payload to include `isBinary` and `extension` fields (based on new path)
- [ ] 6.4 Update TypeScript event type interfaces in `src/socket/types.ts` to include `isBinary` and `extension`

## 7. Client Plugin — Binary Encoding/Decoding

- [ ] 7.1 Replace `isBinaryFile()` skip logic in `src/utils.ts` with a `isBinaryFile()` detection function (returns true = needs base64 encoding, not "skip this file")
- [ ] 7.2 Add `encodeToBase64(buffer: ArrayBuffer): string` and `decodeFromBase64(str: string): ArrayBuffer` utility functions
- [ ] 7.3 Update local file change handlers in `src/handlers.ts`: for binary files, read with `vault.readBinary()` and encode to base64 before emitting `modified-file`
- [ ] 7.4 Update server event handlers in `src/handlers.ts`: when `isBinary` is `true`, decode base64 and write with `vault.createBinary()` / `vault.modifyBinary()`
- [ ] 7.5 Update hash computation in the client: for binary files, hash the base64 string (not raw bytes) to match server-side hashing

## 8. Client Plugin — Initial Sync Updates

- [ ] 8.1 Remove binary file filtering from initial sync in `src/sync.ts` (stop skipping binary extensions)
- [ ] 8.2 Update Phase 2 (download new files): detect `isBinary` from server response and write binary files with `vault.createBinary()`
- [ ] 8.3 Update Phase 3 (merge divergent): for binary files, use server-wins strategy (download server version, no LCS merge)
- [ ] 8.4 Update Phase 4 (upload local-only): encode binary files to base64 before uploading
- [ ] 8.5 Update force push: include binary files in the upload loop, encoding to base64

## 9. Testing & Verification

- [ ] 9.1 Verify server starts cleanly with the new migration (docker compose up)
- [ ] 9.2 Test binary file create/update via REST API — confirm `isBinary` and `extension` in response
- [ ] 9.3 Test file listing with each new filter individually (`extension`, `content_contains`, `path_contains`, `is_binary`)
- [ ] 9.4 Test combined filters and verify `total` count accuracy
- [ ] 9.5 Test comma-separated extension values (`?extension=png,jpg,jpeg`)
- [ ] 9.6 Test that `content_contains` automatically excludes binary files
- [ ] 9.7 Test Socket.IO events include `isBinary` and `extension` fields
- [ ] 9.8 End-to-end: sync a PNG image from one client, verify it arrives intact on another
