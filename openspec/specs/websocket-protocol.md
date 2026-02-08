# WebSocket Protocol

## Overview

The WebSocket layer uses Socket.io to provide real-time bidirectional communication between clients and the server. Clients connect to receive live updates when files change and emit events when they make local changes.

## Connection

### Endpoint

```
ws://{host}:{port}
```

### Authentication

Clients authenticate during the Socket.io handshake by passing the API key in query parameters:

```javascript
const socket = io("ws://localhost:3006", {
  query: {
    apiKey: "sk_store_xxxxxxxxxxxxxxxxxxxx",
  },
});
```

The server validates the key and:

1. Extracts the store ID
2. Verifies permissions
3. Joins the client to the store's room
4. Stores permissions in socket data for event validation

### Connection Failure

If authentication fails, the server disconnects with an error:

```javascript
socket.on("connect_error", (err) => {
  // err.message: "UNAUTHORIZED" | "INVALID_KEY" | "KEY_REVOKED"
});
```

---

## Rooms

Each store has a dedicated Socket.io room. When a client connects:

1. Server validates API key
2. Server joins socket to room: `store:{storeId}`
3. All events from that client are scoped to that store
4. Broadcasts go only to clients in the same store room

---

## Events

### Client -> Server Events

These events are emitted by clients to notify the server of local changes.

#### `created-file`

Emitted when a new file is created.

```typescript
interface CreatedFilePayload {
  path: string; // Relative file path
  content: string; // File contents
}

socket.emit("created-file", payload, (response) => {
  // response: { success: true, hash: "sha256:..." }
  // or: { success: false, error: { code: "...", message: "..." } }
});
```

**Required Permission:** `write`

---

#### `modified-file`

Emitted when a file's content changes.

```typescript
interface ModifiedFilePayload {
  path: string; // Relative file path
  content: string; // New file contents
}

socket.emit("modified-file", payload, (response) => {
  // response: { success: true, hash: "sha256:..." }
});
```

**Required Permission:** `write`

---

#### `deleted-file`

Emitted when a file is deleted.

```typescript
interface DeletedFilePayload {
  path: string; // Relative file path
}

socket.emit("deleted-file", payload, (response) => {
  // response: { success: true }
});
```

**Required Permission:** `write`

---

#### `renamed-file`

Emitted when a file is renamed or moved.

```typescript
interface RenamedFilePayload {
  oldPath: string; // Original file path
  newPath: string; // New file path
}

socket.emit("renamed-file", payload, (response) => {
  // response: { success: true }
});
```

**Required Permission:** `write`

---

### Server -> Client Events

These events are broadcast to other clients when changes occur.

#### `file-created`

Broadcast when a file is created (by another client or via REST API).

```typescript
interface FileCreatedEvent {
  path: string;
  hash: string;
  size: number;
  createdAt: string; // ISO timestamp
}

socket.on("file-created", (event) => {
  // Fetch content via REST if needed
});
```

**Received by:** Clients with `read` permission

---

#### `file-modified`

Broadcast when a file's content changes.

```typescript
interface FileModifiedEvent {
  path: string;
  hash: string;
  size: number;
  updatedAt: string; // ISO timestamp
}

socket.on("file-modified", (event) => {
  // Fetch new content via REST if needed
});
```

**Received by:** Clients with `read` permission

---

#### `file-deleted`

Broadcast when a file is deleted.

```typescript
interface FileDeletedEvent {
  path: string;
  deletedAt: string; // ISO timestamp
}

socket.on("file-deleted", (event) => {
  // Remove local file
});
```

**Received by:** Clients with `read` permission

---

#### `file-renamed`

Broadcast when a file is renamed/moved.

```typescript
interface FileRenamedEvent {
  oldPath: string;
  newPath: string;
  updatedAt: string; // ISO timestamp
}

socket.on("file-renamed", (event) => {
  // Update local file path
});
```

**Received by:** Clients with `read` permission

---

## Event Flow Diagram

```
Client A                    Server                    Client B
   |                          |                          |
   |  emit: created-file      |                          |
   | ------------------------>|                          |
   |                          |  (validate, store in DB) |
   |                          |                          |
   |  callback: success       |                          |
   | <------------------------|                          |
   |                          |                          |
   |                          |  broadcast: file-created |
   |                          | ------------------------>|
   |                          |                          |
```

---

## Acknowledgments

All client->server events use Socket.io acknowledgment callbacks:

```typescript
// Success response
{
  success: true,
  hash?: string,      // For create/modify
}

// Error response
{
  success: false,
  error: {
    code: string,     // "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR" | etc.
    message: string
  }
}
```

---

## Error Handling

### Permission Errors

If a client lacks required permission:

```typescript
{
  success: false,
  error: {
    code: "FORBIDDEN",
    message: "Write permission required"
  }
}
```

### Validation Errors

If payload is invalid:

```typescript
{
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "Path is required"
  }
}
```

### Not Found Errors

If file doesn't exist (for modify/delete/rename):

```typescript
{
  success: false,
  error: {
    code: "NOT_FOUND",
    message: "File not found: notes/missing.md"
  }
}
```

---

## Reconnection

Socket.io handles reconnection automatically. On reconnect:

1. Client re-authenticates with same API key
2. Server re-joins client to store room
3. Client should fetch file list via REST to sync any missed changes

Clients should track the last sync timestamp and fetch changes since that time on reconnect.
