# System Overview

## Purpose

Sync Server is a real-time file synchronization system for personal use. The primary use case is synchronizing Obsidian vaults across multiple devices. The server is client-agnostic — any client implementing the REST + WebSocket protocol can participate.

## Architecture

```
+-------------------+         +-------------------+
|  Obsidian App     |         |  Obsidian App     |
|  (Plugin)         |         |  (Plugin)         |
+--------+----------+         +--------+----------+
         |                             |
         | Socket.IO + REST            | Socket.IO + REST
         |                             |
+--------v-----------------------------v----------+
|              Sync Server                         |
|  +------------+  +-----------+  +-------------+ |
|  | Fastify    |  | Socket.IO |  | Drizzle ORM | |
|  | (REST API) |  | (Realtime)|  | (Data layer)| |
|  +-----+------+  +-----+-----+  +------+------+ |
|        |               |               |         |
+--------+---------------+---------------+---------+
                         |
                  +------v------+
                  | PostgreSQL  |
                  +-------------+
```

## Core Concepts

### Store

An isolated file namespace that maps 1:1 to an Obsidian vault. Each store has a unique UUID, its own files, and dedicated API keys. Stores are completely isolated — files, keys, and real-time events never cross store boundaries.

### File

A synchronized document stored in the database. Each file has a path, text content, SHA-256 hash, byte size, and timestamps. Binary files (images, PDFs, audio, video, etc.) are excluded from synchronization. Files use soft deletes — when deleted, they become tombstones with a 30-day TTL before permanent removal.

### API Key

Provides authenticated access to a store. Two permission types: `read` (list/download files, receive events) and `write` (create/update/delete/rename files). Keys are hashed with SHA-256 for storage; the plaintext key is shown only once at creation.

A separate admin key (configured via environment variable) provides access to store and key management endpoints.

### Tombstone

When a file is deleted, the database row is preserved as a tombstone: content is cleared, and an `expires_at` timestamp is set to 30 days in the future. Tombstones allow offline clients to discover deletions when they reconnect. Expired tombstones are lazily cleaned up during read operations.

Creating or updating a file at a tombstoned path resurrects the tombstone (reuses the row, clears `expires_at`).

## Data Flow

### Real-Time (Client Connected)

1. Client modifies a file locally
2. Client emits a Socket.IO event to the server
3. Server validates, persists to database, computes hash
4. Server broadcasts the change to all other clients in the same store room
5. Other clients apply the change locally

### Reconnection Sync (Client Was Offline)

1. Client reconnects and fetches the full file list including tombstones via REST
2. Client runs a 4-phase sync algorithm:
   - **Phase 1**: Delete local files that are tombstoned on the server
   - **Phase 2**: Download new files from the server
   - **Phase 3**: Merge files that changed on both sides using LCS-based merge with conflict markers
   - **Phase 4**: Upload local-only files to the server
3. Resume real-time sync via WebSocket

### Content Merging

When a file has been modified both locally and on the server while offline, the client performs a two-way merge using Longest Common Subsequence (LCS) diffing. Common lines are preserved, non-overlapping additions from both sides are included, and conflicting regions get git-style conflict markers (`<<<<<<< LOCAL` / `=======` / `>>>>>>> SERVER`). The merged result is written locally and uploaded to the server so both sides converge.

## Health Check

The server exposes a `GET /health` endpoint (no authentication required) that returns:

- `status`: `"healthy"` or `"degraded"` (based on database connectivity)
- `version`: Server version from package.json
- `uptime`: Seconds since process started
- `database`: `"connected"` or `"disconnected"`

Returns HTTP 200 when healthy, 503 when degraded.
