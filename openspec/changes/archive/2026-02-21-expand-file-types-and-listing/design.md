## Context

The sync server currently stores all file content as plain text in PostgreSQL. The Obsidian client plugin skips binary files entirely via a hardcoded `BINARY_EXTENSIONS` set of 55 extensions in `src/utils.ts`. There is no binary awareness on the server — no `is_binary` column, no extension tracking, no base64 detection.

The file listing endpoint (`GET /api/v1/files`) supports only prefix-based path filtering, limit/offset pagination, and a tombstone inclusion flag. There is no way to filter by extension, search content, or do partial path matching.

The `content` column is `text NOT NULL`, the `hash` column is `varchar(71)`, and the existing 10MB content limit is enforced via Zod validation on both REST and Socket.IO paths.

**Constraints:**

- PostgreSQL `text` column can store arbitrary strings including base64
- Socket.IO default max buffer size is 1MB; the server already configures `maxHttpBufferSize: 10MB`
- Obsidian's `vault.readBinary()` returns `ArrayBuffer`, `vault.createBinary()` accepts `ArrayBuffer`
- The Drizzle ORM migration system auto-runs on startup; additive migrations are safe

## Goals / Non-Goals

**Goals:**

- Enable binary files (images, PDFs, fonts, etc.) to sync between clients via base64 encoding
- Server tracks binary status and file extension as first-class metadata
- Add extension, content search, partial path, and binary filtering to the file listing endpoint
- Maintain backward compatibility for text file sync (no changes to text file flow)
- Hash consistency: SHA-256 always computed on the same bytes regardless of transport encoding

**Non-Goals:**

- Streaming or chunked upload for large binary files (use existing single-payload model)
- Full-text search with ranking/relevance (just substring matching via `ILIKE`)
- Dedicated binary storage (S3, filesystem) — binary content stays in PostgreSQL as base64 text
- `pg_trgm` or other advanced indexing for content search (future optimization)
- Support for binary content merging on conflict (binary conflicts will use server-wins strategy)
- Client-side binary diff/delta sync

## Decisions

### 1. Base64 encoding in the `content` column (not a separate `bytea` column)

**Choice:** Store base64-encoded binary content in the existing `text content` column.

**Alternatives considered:**

- `bytea` column: Would require schema changes to content column type, breaking all existing queries and Drizzle ORM type inference. Also complicates JSON serialization in REST/Socket.IO responses.
- Separate `binary_content bytea` column alongside `content text`: Doubles storage logic, requires conditional reads/writes everywhere, complicates the service layer.
- External blob storage (S3/filesystem): Adds deployment complexity and a new dependency. Overkill for the expected file sizes (mostly images <5MB).

**Rationale:** Base64 in the text column requires zero schema changes to the column itself. The 33% overhead is acceptable for the expected file sizes. JSON serialization works naturally. The only new columns are metadata (`is_binary`, `extension`).

### 2. Client-side encoding/decoding (not server-side)

**Choice:** The client encodes binary files to base64 before sending and decodes after receiving. The server stores and transmits the base64 string as-is.

**Alternatives considered:**

- Server-side encoding: Would require the server to detect binary content and encode/decode. But the server receives content as a JSON string — it would need a separate binary upload path (multipart/form-data) which changes the API contract significantly.

**Rationale:** The client already has access to raw binary data via Obsidian's `vault.readBinary()`. Encoding at the source keeps the transport layer (JSON over WebSocket/REST) unchanged. The server just stores text, whether it's markdown or base64.

### 3. SHA-256 hash computed on raw bytes (client-side, pre-encoding)

**Choice:** The client computes the SHA-256 hash on the raw binary `ArrayBuffer` before base64 encoding. The server computes the hash on the base64 string it receives (since it never sees raw bytes). To reconcile this, the client sends the hash along with the content, and the server stores the client-provided hash for binary files.

**Wait — this creates a mismatch.** Let me reconsider.

**Revised choice:** The server computes the hash on the content it stores (the base64 string for binary files, plain text for text files). The client must also hash the base64 string (not raw bytes) when comparing hashes during initial sync. This keeps hash computation consistent: always `SHA-256(stored_content)`.

**Rationale:** Hash consistency is critical for initial sync's Phase 3 (merge detection). If the server hashes base64 and the client hashes raw bytes, they'll never match. By always hashing the stored representation, both sides agree.

### 4. Extension extraction from file path (server-side)

**Choice:** The server extracts the file extension from the path on every create/update/rename operation. The extension is stored lowercase without the dot (e.g., `"png"`, `"md"`, `null` for no extension).

**Alternatives considered:**

- Client sends extension: Adds a field to every event payload. Clients could send inconsistent values.
- Extract on query only: Would require `LIKE '%.png'` on every filtered query, which is slow and can't be indexed.

**Rationale:** Server-side extraction is authoritative (derived from the path, which is the source of truth). Stored in a column, it's indexable for fast filtering.

### 5. Binary detection via extension (not content sniffing)

**Choice:** A file is considered binary if its extension is in a known set. The `is_binary` flag is derived from the extension on the server side.

**Alternatives considered:**

- Content sniffing (magic bytes): Server would need to decode base64 to inspect content. Adds complexity and processing time.
- Client declares `is_binary`: Same risk as client-sent extension — inconsistency across clients.

**Rationale:** Extension-based detection is fast, deterministic, and matches how Obsidian itself treats files. The known binary extensions set lives on the server (single source of truth) and is used during file creation/update.

### 6. `ILIKE` for content search (no trigram index initially)

**Choice:** Content search uses PostgreSQL `ILIKE '%term%'` for case-insensitive substring matching.

**Alternatives considered:**

- `pg_trgm` trigram index: Accelerates `ILIKE` queries significantly but requires the `pg_trgm` extension to be enabled. Adds deployment complexity.
- Full-text search (`tsvector`): Heavyweight, designed for natural language queries, not exact substring matching.
- Application-level filtering: Fetch all files and filter in Node.js. Doesn't scale.

**Rationale:** `ILIKE` works out of the box, requires no extensions, and is correct. For the expected dataset sizes (hundreds to low thousands of files per store), performance will be adequate. If it becomes a bottleneck, `pg_trgm` can be added as a non-breaking optimization later.

### 7. Binary conflict resolution: server-wins (no merge)

**Choice:** During initial sync Phase 3, if a binary file has diverged (different hashes), the server version wins. The client downloads the server copy. No merge is attempted.

**Alternatives considered:**

- Last-write-wins by timestamp: Requires reliable timestamps across clients.
- Conflict markers (like text merge): Meaningless for binary content.
- Keep both (rename one): Adds complexity. Could be a future enhancement.

**Rationale:** Binary content cannot be meaningfully merged. Server-wins is simple and predictable. Users can re-paste an image if needed. The text merge algorithm continues to work for `.md` and other text files.

## Risks / Trade-offs

**[Storage overhead from base64]** → Base64 inflates content by 33%. A 5MB image becomes ~6.7MB in the database. **Mitigation:** The existing 10MB content limit effectively caps binary files at ~7.5MB original size. For the typical use case (Obsidian vault images), most files are well under this. Monitor `pg_database_size()` to track growth.

**[Content search on base64 strings]** → `content_contains` will match against base64-encoded content for binary files, which is meaningless. **Mitigation:** Document that `content_contains` is intended for text files. Optionally, automatically add `is_binary=false` when `content_contains` is used, or let clients handle this.

**[Breaking change for older clients]** → Clients that don't understand `is_binary` will receive base64 strings and write them as text files. **Mitigation:** This is a coordinated rollout — update client and server together. The server change is additive (new columns), but the semantic change in content encoding requires client awareness.

**[Hash computation consistency]** → Both client and server must hash the same representation (base64 string for binary, plain text for text). If a client hashes raw bytes instead of base64, sync will detect false conflicts on every binary file. **Mitigation:** Document clearly; add integration tests that verify hash round-trip for binary files.

**[ILIKE performance on large stores]** → Sequential scan for `content_contains` on stores with thousands of files. **Mitigation:** Acceptable for expected scale. The `extension` and `is_binary` filters use indexed columns and can narrow results before content search. Add `pg_trgm` if needed later.

## Migration Plan

### Database Migration

1. Add `is_binary boolean NOT NULL DEFAULT false` column to `files` table
2. Add `extension text` (nullable) column to `files` table
3. Add `files_extension_idx` btree index on `(store_id, extension)`
4. Backfill `extension` for existing rows from `path` (extract extension from path)
5. All existing rows get `is_binary = false` by default (correct — no binary files exist yet)

Migration is additive and non-breaking. Default values mean no downtime. Backfill runs in the migration SQL.

### Rollback Strategy

- Drop the `extension` and `is_binary` columns via a reverse migration
- Client reverts to skipping binary files
- No data loss — binary files that were synced are simply no longer synced (they persist locally)

## Resolved Questions

1. **`content_contains` automatically excludes binary files.** When `content_contains` is provided, an implicit `WHERE is_binary = false` is added. Searching base64-encoded content is meaningless and would produce nonsensical results.

2. **Binary extensions set is hardcoded on the server.** No configuration mechanism for now. Hardcode and make configurable later if needed.

3. **`extension` accepts comma-separated values.** Example: `?extension=png,jpg,jpeg` filters to files matching any of those extensions. Values are split on comma, trimmed, and lowercased before matching.
