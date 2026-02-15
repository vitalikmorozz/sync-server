# Real-Time Synchronization Protocol

## Overview

The sync protocol uses Socket.IO for real-time bidirectional communication and REST for bulk operations (initial sync, force push). Clients connect to the server, authenticate via API key, join a store room, and then emit/receive file change events in real time. When a client reconnects after being offline, it runs a 4-phase initial sync algorithm using the REST API to reconcile state.

Both the Socket.IO layer and the REST API can trigger broadcasts to connected clients. Write operations via REST also emit socket events to the store room, so all connected clients stay up to date regardless of which path originated the change.

---

## Connection & Authentication

### Client Connection

```typescript
const socket = io("ws://server-host:3006", {
  reconnectionAttempts: 5,
  reconnectionDelay: 5000, // 5 seconds between retries
  reconnectionDelayMax: 30000, // max 30 seconds backoff
  transports: ["websocket"], // WebSocket only, no long-polling
  query: { apiKey: "sk_store_xxxxxxxxxxxxxxxxxxxx" },
});
```

### Server Authentication (Handshake Middleware)

When a client connects, the server Socket.IO middleware:

1. Extracts `apiKey` from `socket.handshake.query`
2. Validates format: must start with `sk_store_`
3. SHA-256 hashes the key
4. Looks up the hash in the `api_keys` table (must not be revoked)
5. On success:
   - Attaches `storeId`, `permissions`, `keyId` to `socket.data`
   - Joins the socket to room `store:{storeId}`
   - Updates `lastUsedAt` asynchronously
6. On failure: disconnects with error (`UNAUTHORIZED`, `INVALID_KEY`, `KEY_REVOKED`)

### Connection Events (Client-Side)

```typescript
socket.on("connect", () => {
  // Connected successfully. Triggers initial sync.
});

socket.on("connect_error", (err) => {
  // err.message: "UNAUTHORIZED" | "INVALID_KEY" | "KEY_REVOKED"
});

socket.on("disconnect", (reason) => {
  // reason: "io server disconnect" | "io client disconnect" | "transport close" | etc.
});
```

---

## Rooms

Each store has a dedicated Socket.IO room named `store:{storeId}`. When a client connects and authenticates:

1. Server joins the socket to its store room
2. All events from that client are scoped to that store
3. Broadcasts go only to other clients in the same room (excluding the sender)

---

## Client-to-Server Events

These events are emitted by the client to notify the server of local file changes. All require **write** permission and use acknowledgment callbacks.

### `created-file`

Emitted when a new file is created. Creates an **empty** file on the server.

```typescript
interface CreatedFilePayload {
  path: string; // Relative file path (1-1000 chars)
}

socket.emit("created-file", { path }, (response: AckResponse) => {
  // response: { success: true, hash: "sha256:..." }
});
```

**Server behavior**: Creates an empty file in the database. If a file (or tombstone) already exists at the path, returns the existing hash without broadcasting. Only broadcasts `file-created` if a new file was actually created.

**Note**: The Obsidian client plugin does **not** use this event. It uses `modified-file` for all creates (with content included). This event exists for clients that need to create a placeholder before writing content.

---

### `modified-file`

Emitted when a file is created or modified. This is the primary event used by the Obsidian client for both creates and modifications (upsert semantics).

```typescript
interface ModifiedFilePayload {
  path: string; // Relative file path
  content: string; // File contents (max 10MB)
}

socket.emit("modified-file", { path, content }, (response: AckResponse) => {
  // response: { success: true, hash: "sha256:..." }
});
```

**Server behavior**: Upserts the file. If the file is new (or a tombstone is resurrected), broadcasts `file-created`. If the file already existed and was updated, broadcasts `file-modified`. Computes SHA-256 hash and stores the content.

---

### `deleted-file`

Emitted when a file is deleted.

```typescript
interface DeletedFilePayload {
  path: string; // Relative file path
}

socket.emit("deleted-file", { path }, (response: AckResponse) => {
  // response: { success: true }
});
```

**Server behavior**: Soft-deletes the file (sets `expires_at` to now + 30 days, clears content). Broadcasts `file-deleted` only if the file existed and was actually deleted. Returns success even if the file was not found.

---

### `renamed-file`

Emitted when a file is renamed or moved.

```typescript
interface RenamedFilePayload {
  oldPath: string; // Original file path
  newPath: string; // New file path
}

socket.emit("renamed-file", { oldPath, newPath }, (response: AckResponse) => {
  // response: { success: true }
});
```

**Server behavior**: If the source file exists, updates its path and broadcasts `file-renamed`. If the source file does not exist, creates an empty file at the new path and broadcasts `file-created` instead.

---

## Server-to-Client Events

These events are broadcast by the server to all clients in the store room **except** the originator (`socket.to(room).emit(...)`). REST API write operations also broadcast these events to the **entire** store room (all connected clients).

### `file-created`

```typescript
interface FileCreatedEvent {
  path: string;
  content: string; // Full file contents
  hash: string; // "sha256:..." (71 chars)
  size: number; // Bytes
  createdAt: string; // ISO 8601 timestamp
}

socket.on("file-created", (event) => {
  // Create the file locally if it doesn't exist
});
```

---

### `file-modified`

```typescript
interface FileModifiedEvent {
  path: string;
  content: string; // Full updated contents
  hash: string;
  size: number;
  updatedAt: string; // ISO 8601 timestamp
}

socket.on("file-modified", (event) => {
  // Update the local file, or create if missing
});
```

---

### `file-deleted`

```typescript
interface FileDeletedEvent {
  path: string;
  deletedAt: string; // ISO 8601 timestamp
}

socket.on("file-deleted", (event) => {
  // Delete the local file
});
```

---

### `file-renamed`

```typescript
interface FileRenamedEvent {
  oldPath: string;
  newPath: string;
  content: string; // File contents at new path
  hash: string;
  size: number;
  updatedAt: string; // ISO 8601 timestamp
}

socket.on("file-renamed", (event) => {
  // Rename local file, or create at newPath if oldPath missing locally
});
```

---

## Acknowledgment Callbacks

Every client-to-server event receives a response via Socket.IO acknowledgment:

```typescript
// Success
{ success: true, hash?: string }     // hash included for created-file, modified-file

// Error
{
  success: false,
  error: {
    code: string,     // "FORBIDDEN" | "VALIDATION_ERROR" | "INTERNAL_ERROR"
    message: string   // Human-readable message
  }
}
```

---

## Dual-Path Broadcasting

Both Socket.IO handlers and REST endpoints trigger broadcasts. This ensures all connected clients stay synchronized regardless of whether a change came through the WebSocket or REST path.

```
                    Socket.IO Event
Client A  ──────────────────────────>  Server
                                         │
                     Persist to DB       │
                                         │
             socket.to(room).emit()      │
Client B  <──────────────────────────    │
Client C  <──────────────────────────    │


                    REST API
Curl/App  ──────────────────────────>  Server
                                         │
                     Persist to DB       │
                                         │
           broadcastToStore(io, ...)     │
Client B  <──────────────────────────    │
Client C  <──────────────────────────    │
```

**Difference**: Socket.IO broadcasts exclude the sender (`socket.to(room)`). REST broadcasts go to the entire room (all connected clients receive the event).

---

## Payload Validation

All payloads are validated server-side using Zod schemas before processing:

| Field                | Constraints                                                    |
| -------------------- | -------------------------------------------------------------- |
| `path`               | 1-1000 chars, regex: no `< > : " \| ? *` or control characters |
| `content`            | Max 10MB string                                                |
| `oldPath`, `newPath` | Same constraints as `path`                                     |

Invalid payloads receive a `VALIDATION_ERROR` acknowledgment and are not processed.

---

## Echo Prevention (Client-Side)

The Obsidian client uses a `pendingPaths: Set<string>` mechanism to prevent infinite feedback loops:

```
1. Client receives server event (e.g., "file-modified")
2. Client calls markPending(path) — adds path to Set
3. Client writes to local vault (vault.modify)
4. Obsidian fires vault "modify" event
5. Client's local handler checks isPending(path) → true → SKIPS sending to server
6. Client calls clearPending(path) — removes from Set after 200ms delay
```

The 200ms delay in `clearPending` ensures the vault event has time to fire before the path is unmarked. Without this, the event handler might run before the pending flag is checked.

### Local Event Handling

| Vault Event | Socket Event Emitted | Notes                                                             |
| ----------- | -------------------- | ----------------------------------------------------------------- |
| `create`    | `modified-file`      | 100ms delay before reading content (lets Obsidian finish writing) |
| `modify`    | `modified-file`      | Immediate (no debounce)                                           |
| `delete`    | `deleted-file`       | Immediate                                                         |
| `rename`    | `renamed-file`       | Both old and new paths checked for pending                        |

All local handlers skip if: file is not a `TFile`, path is binary, socket is disconnected, or path is pending.

---

## Binary File Exclusion

Both client and server skip binary files. The client checks the file extension against a hardcoded set of 55 extensions:

**Images**: png, jpg, jpeg, gif, bmp, webp, ico, svg, tiff, tif
**Documents**: pdf, doc, docx, xls, xlsx, ppt, pptx, odt, ods, odp
**Archives**: zip, rar, 7z, tar, gz, bz2, xz
**Audio**: mp3, wav, ogg, flac, aac, wma, m4a
**Video**: mp4, avi, mkv, mov, wmv, flv, webm
**Executables**: exe, dll, so, dylib, bin
**Fonts**: ttf, otf, woff, woff2, eot
**Databases**: db, sqlite, sqlite3

---

## Initial Sync Protocol

Triggered automatically on WebSocket `connect` and manually via the "Sync now" command. Uses the REST API for bulk operations.

### Phase 1: Delete Tombstoned Files

1. Fetch full file list from server including tombstones:
   ```
   GET /api/v1/files?limit=1000&offset=0&include_deleted=true
   ```
   (Paginated — repeats until all files fetched)
2. For each server file with `expiresAt` set (tombstone):
   - If a local file exists at that path, delete it locally

### Phase 2: Download New Files

For each active server file (no `expiresAt`) that does not exist locally:

1. Fetch content via REST:
   ```
   GET /api/v1/files?path={urlEncodedPath}
   ```
2. Create parent directories as needed
3. Create the file locally

### Phase 3: Merge Divergent Files

For each file that exists both locally and on the server (active):

1. Read local file content
2. Compute local SHA-256 hash
3. Compare with server hash
4. If hashes differ:
   - Fetch server content via REST
   - Run two-way LCS merge (see Content Merging below)
   - Write merged result locally
   - Upload merged result to server via `modified-file` socket event

### Phase 4: Upload Local-Only Files

For each local file that has no corresponding entry on the server (not even a tombstone):

- Upload via `modified-file` socket event with path and content

### Sync Summary

After all phases, a notice is shown:

```
Sync complete: {downloaded} new, {merged} merged, {uploaded} uploaded, {deleted} deleted
```

If conflicts were detected during merge, an additional message:

```
({count} conflict(s) — search for <<<<<<< to resolve)
```

---

## Content Merging

When a file has changed on both sides while the client was offline, the client performs a two-way merge using Longest Common Subsequence (LCS) diffing. This is a **two-way** merge (no common ancestor / base content).

### Algorithm

1. Split both local and server content into lines
2. Compute LCS between the two line arrays
3. Walk through aligned regions:
   - **Common lines**: preserved as-is
   - **One side changed**: include the changed lines
   - **Both sides changed identically**: include once
   - **Both sides changed differently**: emit conflict markers

### Conflict Markers

```
<<<<<<< LOCAL
local-only changes here
=======
server-only changes here
>>>>>>> SERVER
```

### Result

The merge produces:

- `content`: the merged text
- `hasConflicts`: whether any conflict markers were inserted
- `conflictCount`: number of conflict regions

The merged content is written locally AND uploaded to the server so both sides converge on the same content.

---

## Force Push

The "Force sync store state to local state" command (with confirmation modal):

1. Delete all server files:
   ```
   DELETE /api/v1/files/all
   X-API-Key: {apiKey}
   ```
2. Upload every local (non-binary) file:
   ```
   PUT /api/v1/files
   X-API-Key: {apiKey}
   Content-Type: application/json
   { "path": "...", "content": "..." }
   ```

---

## Reconnection Behavior

### Socket.IO Reconnection

- **Attempts**: 5 retries before giving up
- **Delay**: Starts at 5 seconds, exponential backoff up to 30 seconds
- **Transport**: WebSocket only (no long-polling fallback)

### On Successful Reconnect

1. Socket.IO re-runs the handshake (API key re-validated, room re-joined)
2. `connect` event fires
3. Full initial sync runs automatically (4 phases)
4. Real-time event handling resumes

### Manual Reconnect

The "Reconnect to server" command disconnects any existing socket and creates a new connection. The "Disconnect from server" command manually disconnects without reconnection.

---

## Event Flow Diagrams

### Real-Time File Modification

```
Client A                     Server                      Client B
   |                            |                            |
   |  emit: modified-file       |                            |
   |  { path, content }         |                            |
   | ─────────────────────────> |                            |
   |                            |  validate payload          |
   |                            |  upsert in database        |
   |                            |  compute hash              |
   |                            |                            |
   |  ack: { success, hash }    |                            |
   | <───────────────────────── |                            |
   |                            |                            |
   |                            |  emit: file-modified       |
   |                            |  { path, content, hash,    |
   |                            |    size, updatedAt }       |
   |                            | ─────────────────────────> |
   |                            |                            |
   |                            |         markPending(path)  |
   |                            |         vault.modify(file) |
   |                            |         clearPending(path) |
   |                            |                            |
```

### REST API Write with Broadcast

```
Admin/CLI                    Server                      Client B
   |                            |                            |
   |  PUT /api/v1/files         |                            |
   |  X-API-Key: sk_store_...   |                            |
   |  { path, content }         |                            |
   | ─────────────────────────> |                            |
   |                            |  validate, store in DB     |
   |                            |                            |
   |  200 OK { path, hash, ... }|                            |
   | <───────────────────────── |                            |
   |                            |                            |
   |                            |  broadcastToStore:         |
   |                            |  file-modified / created   |
   |                            | ─────────────────────────> |
   |                            |                            |
```

### Initial Sync on Reconnect

```
Client                       Server
   |                            |
   |  Socket.IO connect         |
   |  ?apiKey=sk_store_...      |
   | ─────────────────────────> |
   |                            |  validate key, join room
   |  connect event             |
   | <───────────────────────── |
   |                            |
   |  GET /files?include_deleted|
   | ─────────────────────────> |
   |  { files: [...] }          |
   | <───────────────────────── |
   |                            |
   |  Phase 1: delete local     |
   |           tombstoned files |
   |                            |
   |  Phase 2: GET /files?path= |  (per missing file)
   | ─────────────────────────> |
   |  { path, content, ... }    |
   | <───────────────────────── |
   |                            |
   |  Phase 3: merge divergent  |
   |  emit: modified-file       |  (upload merged result)
   | ─────────────────────────> |
   |                            |
   |  Phase 4: upload local-only|
   |  emit: modified-file       |
   | ─────────────────────────> |
   |                            |
   |  Real-time sync resumes    |
   |                            |
```
