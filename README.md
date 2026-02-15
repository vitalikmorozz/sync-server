# Sync Server

A lightweight, real-time file synchronization server. Clients connect via Socket.IO to send and receive file change events, and the server broadcasts updates to all other connected clients in the same store. A REST API is provided for file management and administrative operations.

The primary client is an Obsidian plugin, but the server is client-agnostic -- anything that implements the REST + Socket.IO protocol can participate.

## Key Features

- **Real-time sync** via Socket.IO -- file changes propagate to connected clients within seconds
- **REST API** for file CRUD, initial sync, and administrative operations
- **Store isolation** -- each store (vault) is a separate namespace with its own files and API keys
- **API key authentication** with granular read/write permissions
- **Soft deletes** with 30-day tombstone retention for offline sync
- **PostgreSQL** storage with Drizzle ORM (designed for easy DB switching)
- **Two-way merge** with LCS diffing and conflict markers on reconnect

## Tech Stack

| Component  | Technology     |
| ---------- | -------------- |
| Runtime    | Node.js 20+    |
| Language   | TypeScript 5.x |
| HTTP       | Fastify 5.x    |
| WebSocket  | Socket.IO 4.x  |
| ORM        | Drizzle ORM    |
| Database   | PostgreSQL 15+ |
| Validation | Zod            |

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [Docker](https://www.docker.com/) and Docker Compose (for the database)
- npm

## Quick Start

### 1. Clone and install

```bash
git clone <repository-url>
cd sync-server
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` as needed. The defaults work for local development.

### 3. Start the database

```bash
npm run db:up
```

This starts a PostgreSQL 15 container on port 5432.

### 4. Run the server

```bash
# Terminal 1: TypeScript watch compilation
npm run watch

# Terminal 2: Development server with hot reload
npm run dev
```

The server starts at `http://localhost:3006`. Database migrations run automatically on startup.

### 5. Create a store and API key

```bash
# Create a store
curl -X POST http://localhost:3006/api/v1/admin/stores \
  -H "X-API-Key: sk_admin_CHANGE_ME_IN_PRODUCTION" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Vault"}'

# Create an API key for the store (replace STORE_ID with the id from above)
curl -X POST http://localhost:3006/api/v1/admin/stores/STORE_ID/keys \
  -H "X-API-Key: sk_admin_CHANGE_ME_IN_PRODUCTION" \
  -H "Content-Type: application/json" \
  -d '{"name": "Obsidian Desktop", "permissions": ["read", "write"]}'
```

Save the returned `key` value -- it is only shown once.

## Environment Variables

| Variable        | Required | Default     | Description                                       |
| --------------- | -------- | ----------- | ------------------------------------------------- |
| `PORT`          | No       | 3006        | HTTP server port                                  |
| `HOST`          | No       | 0.0.0.0     | Bind address                                      |
| `NODE_ENV`      | No       | development | Environment                                       |
| `DATABASE_URL`  | Yes      | --          | PostgreSQL connection string                      |
| `ADMIN_API_KEY` | Yes      | --          | Master admin API key (`sk_admin_*` format)        |
| `LOG_LEVEL`     | No       | info        | Pino log level (debug/info/warn/error)            |
| `CORS_ORIGINS`  | No       | \*          | Allowed origins (comma-separated, or `*` for all) |

Generate a secure admin key:

```bash
node -e "console.log('sk_admin_' + require('crypto').randomBytes(24).toString('base64url'))"
```

## NPM Scripts

### Development

| Script           | Description                                  |
| ---------------- | -------------------------------------------- |
| `npm run watch`  | TypeScript watch compilation                 |
| `npm run dev`    | Development server with hot reload (nodemon) |
| `npm run format` | Format code with Prettier                    |
| `npm run build`  | Production build                             |
| `npm run start`  | Start production server                      |

### Database (Docker)

| Script             | Description                                  |
| ------------------ | -------------------------------------------- |
| `npm run db:up`    | Start PostgreSQL container                   |
| `npm run db:down`  | Stop and remove PostgreSQL container         |
| `npm run db:stop`  | Stop PostgreSQL container (keep data)        |
| `npm run db:logs`  | Follow PostgreSQL logs                       |
| `npm run db:reset` | Destroy volume and recreate (fresh database) |

### Database (Drizzle)

| Script                | Description                             |
| --------------------- | --------------------------------------- |
| `npm run db:generate` | Generate migration from schema changes  |
| `npm run db:migrate`  | Apply pending migrations                |
| `npm run db:push`     | Push schema directly (development only) |
| `npm run db:studio`   | Open Drizzle Studio (database GUI)      |

### Docker (Full Stack)

| Script                 | Description                    |
| ---------------------- | ------------------------------ |
| `npm run docker:build` | Build server + database images |
| `npm run docker:up`    | Start full stack               |
| `npm run docker:down`  | Stop full stack                |
| `npm run docker:logs`  | Follow full stack logs         |

## Production Deployment

### Using Docker Compose

```bash
# Set required environment variables
export ADMIN_API_KEY="$(node -e "console.log('sk_admin_' + require('crypto').randomBytes(24).toString('base64url'))")"

# Build and start
docker-compose up -d

# Check health
curl http://localhost:3006/health

# View logs
docker-compose logs -f sync-server
```

The `docker-compose.yml` includes both the server and PostgreSQL. The server image is a multi-stage build (build + production stages) running as a non-root user.

### Manual Deployment

```bash
# Build
npm run build

# Set environment variables
export DATABASE_URL="postgresql://user:password@host:5432/syncserver"
export ADMIN_API_KEY="sk_admin_your_secure_key"
export NODE_ENV=production

# Start
npm run start
```

Migrations run automatically on startup. If they fail, the process exits with code 1.

## API Overview

### File Endpoints (store key required)

| Method | Path                           | Permission | Description                         |
| ------ | ------------------------------ | ---------- | ----------------------------------- |
| GET    | `/api/v1/files?path=...`       | read       | Get file content                    |
| GET    | `/api/v1/files?limit=&offset=` | read       | List files with pagination          |
| POST   | `/api/v1/files`                | write      | Create file (strict, 409 if exists) |
| PUT    | `/api/v1/files`                | write      | Upsert file                         |
| DELETE | `/api/v1/files?path=...`       | write      | Soft-delete file                    |
| DELETE | `/api/v1/files/all`            | write      | Soft-delete all files               |
| PATCH  | `/api/v1/files`                | write      | Rename/move file                    |

### Admin Endpoints (admin key required)

| Method | Path                                   | Description    |
| ------ | -------------------------------------- | -------------- |
| GET    | `/api/v1/admin/stores`                 | List stores    |
| POST   | `/api/v1/admin/stores`                 | Create store   |
| DELETE | `/api/v1/admin/stores/:id`             | Delete store   |
| GET    | `/api/v1/admin/stores/:id/keys`        | List API keys  |
| POST   | `/api/v1/admin/stores/:id/keys`        | Create API key |
| DELETE | `/api/v1/admin/stores/:id/keys/:keyId` | Revoke API key |

### Other

| Method | Path      | Description            |
| ------ | --------- | ---------------------- |
| GET    | `/health` | Health check (no auth) |

## Socket.IO Events

### Client -> Server (require write permission)

| Event           | Payload                | Description           |
| --------------- | ---------------------- | --------------------- |
| `created-file`  | `{ path }`             | Create empty file     |
| `modified-file` | `{ path, content }`    | Create or update file |
| `deleted-file`  | `{ path }`             | Soft-delete file      |
| `renamed-file`  | `{ oldPath, newPath }` | Rename/move file      |

### Server -> Client (broadcast to store room)

| Event           | Payload                                                | Description       |
| --------------- | ------------------------------------------------------ | ----------------- |
| `file-created`  | `{ path, content, hash, size, createdAt }`             | File was created  |
| `file-modified` | `{ path, content, hash, size, updatedAt }`             | File was modified |
| `file-deleted`  | `{ path, deletedAt }`                                  | File was deleted  |
| `file-renamed`  | `{ oldPath, newPath, content, hash, size, updatedAt }` | File was renamed  |

## Project Structure

```
src/
  index.ts              Entry point, migrations, graceful shutdown
  app.ts                Fastify app, CORS, error handler, Socket.IO init

  socket/
    index.ts            Socket.IO server creation, broadcastToStore()
    types.ts            Event/payload type definitions
    auth.ts             Socket authentication middleware
    handlers.ts         Socket event handlers (4 events)

  routes/
    index.ts            Route registration
    health.ts           GET /health
    files.ts            File CRUD endpoints
    admin/
      stores.ts         Store management
      apiKeys.ts        API key management

  middleware/
    auth.ts             HTTP auth middleware (admin + store key)

  schemas/
    index.ts            Zod validation schemas

  errors/
    index.ts            Error classes (400-500)

  services/
    files.ts            File CRUD with soft-delete tombstones
    apiKeys.ts          API key lifecycle
    stores.ts           Store CRUD with stats

  utils/
    apiKey.ts           Key generation and hashing

  db/
    index.ts            PostgreSQL pool + Drizzle instance
    schema/             Table definitions and relations
    migrations/         SQL migration files
```

## Connecting with a Database Tool

After starting the dev database with `npm run db:up`, connect using DBeaver, pgAdmin, or any PostgreSQL client:

| Field    | Value        |
| -------- | ------------ |
| Host     | `localhost`  |
| Port     | `5432`       |
| Database | `syncserver` |
| Username | `syncuser`   |
| Password | `syncpass`   |

Connection string: `postgresql://syncuser:syncpass@localhost:5432/syncserver`

## License

MIT
