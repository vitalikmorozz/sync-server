# Deployment

## Overview

This document covers deployment configuration, environment variables, Docker setup, and production considerations.

## Environment Variables

| Variable        | Required | Default     | Description                            |
| --------------- | -------- | ----------- | -------------------------------------- |
| `PORT`          | No       | 3006        | HTTP server port                       |
| `NODE_ENV`      | No       | development | Environment (development/production)   |
| `DATABASE_URL`  | Yes      | -           | PostgreSQL connection string           |
| `ADMIN_API_KEY` | Yes      | -           | Master admin API key                   |
| `LOG_LEVEL`     | No       | info        | Log level (debug/info/warn/error)      |
| `CORS_ORIGINS`  | No       | \*          | Allowed CORS origins (comma-separated) |

### Example `.env`

```env
PORT=3006
NODE_ENV=production
DATABASE_URL=postgresql://user:password@localhost:5432/syncserver
ADMIN_API_KEY=sk_admin_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LOG_LEVEL=info
CORS_ORIGINS=https://myapp.com,https://app.myapp.com
```

---

## Docker

### Dockerfile

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built files
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3006

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
```

### docker-compose.yml

```yaml
version: "3.8"

services:
  sync-server:
    build: .
    ports:
      - "3006:3006"
    environment:
      - PORT=3006
      - NODE_ENV=production
      - DATABASE_URL=postgresql://syncuser:syncpass@postgres:5432/syncserver
      - ADMIN_API_KEY=${ADMIN_API_KEY}
      - LOG_LEVEL=info
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=syncuser
      - POSTGRES_PASSWORD=syncpass
      - POSTGRES_DB=syncserver
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U syncuser -d syncserver"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

### Build and Run

```bash
# Build image
docker build -t sync-server .

# Run with compose
docker-compose up -d

# View logs
docker-compose logs -f sync-server

# Stop
docker-compose down
```

---

## Database Setup

### PostgreSQL

```bash
# Create database
createdb syncserver

# Or via psql
psql -c "CREATE DATABASE syncserver;"

# Run migrations
npm run db:migrate
```

### Drizzle Commands

```bash
# Generate migration from schema changes
npm run db:generate

# Apply pending migrations
npm run db:migrate

# Push schema directly (development only)
npm run db:push

# Open Drizzle Studio (database GUI)
npm run db:studio
```

### Package.json Scripts

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

---

## Production Checklist

### Security

- [ ] Set strong `ADMIN_API_KEY`
- [ ] Configure CORS appropriately (`CORS_ORIGINS`)
- [ ] Use HTTPS (via reverse proxy or directly)
- [ ] Run as non-root user (Docker handles this)
- [ ] Keep dependencies updated

### Performance

- [ ] Set `NODE_ENV=production`
- [ ] Configure PostgreSQL connection pooling
- [ ] Set appropriate `LOG_LEVEL` (info or warn)
- [ ] Consider adding rate limiting

### Reliability

- [ ] Set up database backups
- [ ] Configure restart policy (`restart: unless-stopped`)
- [ ] Add health check endpoint monitoring
- [ ] Set up log aggregation

### Monitoring

- [ ] Monitor `/health` endpoint
- [ ] Track error rates
- [ ] Monitor database connections
- [ ] Set up alerting for downtime

---

## Reverse Proxy (Optional)

### Nginx Configuration

```nginx
upstream sync_server {
    server 127.0.0.1:3006;
}

server {
    listen 443 ssl http2;
    server_name sync.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # REST API
    location /api/ {
        proxy_pass http://sync_server;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /socket.io/ {
        proxy_pass http://sync_server;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Health check
    location /health {
        proxy_pass http://sync_server;
    }
}
```

### Caddy Configuration

```caddyfile
sync.example.com {
    reverse_proxy localhost:3006
}
```

Caddy automatically handles HTTPS and WebSocket upgrades.

---

## Initial Setup

After deployment, create the first store and API key:

```bash
# Using curl with admin key
export ADMIN_KEY="sk_admin_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export SERVER="https://sync.example.com"

# Create a store
curl -X POST "$SERVER/api/v1/admin/stores" \
  -H "X-API-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Vault"}'

# Response: {"id": "store_abc123", "name": "My Vault", ...}

# Create an API key for the store
curl -X POST "$SERVER/api/v1/admin/stores/store_abc123/keys" \
  -H "X-API-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Obsidian Desktop", "permissions": ["read", "write"]}'

# Response: {"id": "key_xyz", "key": "sk_store_abc123_...", ...}
# Save the key! It won't be shown again.
```

---

## Backup and Restore

### Database Backup

```bash
# Backup
pg_dump -Fc syncserver > backup_$(date +%Y%m%d).dump

# Restore
pg_restore -d syncserver backup_20240115.dump
```

### Docker Backup

```bash
# Backup PostgreSQL volume
docker run --rm \
  -v syncserver_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres_backup.tar.gz -C /data .
```
