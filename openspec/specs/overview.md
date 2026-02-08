# Sync Server - System Overview

## Purpose

Sync Server is a lightweight, real-time file synchronization server designed to keep files in sync across multiple clients. The primary use case is synchronizing Obsidian vaults across devices, but the server is client-agnostic and can be used with any application that implements the protocol.

## Goals

- **Real-time synchronization**: Changes propagate to connected clients within seconds
- **Simple deployment**: Single binary/container with minimal configuration
- **Small scale**: Designed for personal use or small teams (handful of clients)
- **File-size optimized**: Handles files up to a few MB efficiently (notes, markdown, small attachments)
- **Database-backed storage**: Files stored in PostgreSQL for reliability and queryability
- **Secure by default**: API key authentication for all operations

## Non-Goals

- **Large file handling**: Not designed for video/large binary files
- **Conflict resolution UI**: Uses last-write-wins; no merge interface
- **End-to-end encryption**: Server has access to file contents (encrypt at client if needed)
- **High availability**: Single-instance deployment; no clustering
- **Version history**: Only current file state is stored (no git-like history)

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Obsidian App   │     │  Other Client   │     │   Admin Tool    │
│  (Plugin)       │     │                 │     │                 │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │ Socket.io             │ Socket.io             │ REST
         │ + REST                │ + REST                │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │      Sync Server        │
                    │  ┌───────────────────┐  │
                    │  │    Fastify        │  │
                    │  │  (REST API)       │  │
                    │  └─────────┬─────────┘  │
                    │            │            │
                    │  ┌─────────┴─────────┐  │
                    │  │    Socket.io      │  │
                    │  │  (Real-time)      │  │
                    │  └─────────┬─────────┘  │
                    │            │            │
                    │  ┌─────────┴─────────┐  │
                    │  │   Drizzle ORM     │  │
                    │  │  (Data Layer)     │  │
                    │  └─────────┬─────────┘  │
                    └────────────┼────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │      PostgreSQL         │
                    │  (stores, files, keys)  │
                    └─────────────────────────┘
```

## Key Concepts

### Store

A **Store** is an isolated file namespace. Each store:

- Has a unique identifier
- Contains its own set of files
- Has dedicated API keys for access
- Maps 1:1 to an Obsidian vault (or similar client workspace)

Clients connect to a specific store and only see/modify files within that store.

### API Key

An **API Key** provides authenticated access to a store with specific permissions:

- **Read**: Can list and download files
- **Write**: Can create, update, delete files
- **Read+Write**: Full file access
- **Admin**: Can manage stores and keys (master key only)

### File

A **File** is a stored document with:

- **path**: Relative path within the store (e.g., `notes/daily/2024-01-15.md`)
- **content**: File contents (text or base64-encoded binary)
- **hash**: Content hash for change detection
- **size**: File size in bytes
- **timestamps**: Created and last modified times

## Technology Stack

| Component      | Technology     | Purpose                               |
| -------------- | -------------- | ------------------------------------- |
| Runtime        | Node.js 20+    | JavaScript execution                  |
| Language       | TypeScript 5.x | Type-safe development                 |
| HTTP Framework | Fastify 5.x    | REST API, routing, validation         |
| WebSocket      | Socket.io 4.x  | Real-time bidirectional communication |
| ORM            | Drizzle ORM    | Type-safe database access             |
| Database       | PostgreSQL 15+ | Primary data store                    |
| Validation     | Zod            | Request/payload validation            |

## Data Flow

### File Creation

1. Client creates file locally
2. Client emits `created-file` via Socket.io with file data
3. Server validates API key permissions (write)
4. Server stores file in database
5. Server broadcasts `file-created` to other clients in same store room
6. Server acknowledges to originating client

### File Modification

1. Client modifies file locally
2. Client emits `modified-file` with new content
3. Server validates permissions and updates database (last-write-wins)
4. Server broadcasts `file-modified` to other clients
5. Other clients update their local copies

### Client Connection

1. Client connects to Socket.io with API key in query params
2. Server validates API key, extracts store ID and permissions
3. Server joins client to store's room
4. Client can now emit/receive events for that store
