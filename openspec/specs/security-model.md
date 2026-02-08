# Security Model

## Overview

The security model provides authentication and authorization for both REST API and WebSocket connections. All access is controlled through API keys scoped to specific stores with granular permissions.

## API Key Structure

### Format

```
sk_store_{storeIdPrefix}_{randomSecret}
```

Example: `sk_store_abc123_xK9mN2pL5qR8tU1wY4zA7cE0fH3jB6`

- **Prefix**: `sk_store_` - identifies as a store-scoped key
- **Store ID Prefix**: First 6 chars of store UUID
- **Secret**: 32 character random alphanumeric string

### Generation

```typescript
function generateApiKey(storeId: string): { key: string; hash: string } {
  const storePrefix = storeId.replace(/-/g, "").substring(0, 6);
  const secret = crypto.randomBytes(24).toString("base64url");
  const key = `sk_store_${storePrefix}_${secret}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return { key, hash };
}
```

### Storage

- **Full key**: Shown once at creation, never stored
- **Hash**: SHA-256 hash stored in database for validation
- **Prefix**: First 12 chars stored for key identification in UI

---

## Permissions

### Permission Types

| Permission | Description      | Allows                                       |
| ---------- | ---------------- | -------------------------------------------- |
| `read`     | Read-only access | List files, get file content, receive events |
| `write`    | Write access     | Create, update, delete, rename files         |

### Permission Combinations

| Permissions         | Use Case                                    |
| ------------------- | ------------------------------------------- |
| `["read"]`          | Read-only client, backup systems            |
| `["write"]`         | Write-only ingestion (unusual)              |
| `["read", "write"]` | Full access client (typical Obsidian usage) |

### Admin Keys

A special master API key (configured via environment variable) has admin permissions:

- Create and delete stores
- Create and revoke API keys
- Access admin endpoints

```
ADMIN_API_KEY=sk_admin_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Authentication Flow

### REST API

```
┌─────────┐          ┌─────────────────────────┐          ┌──────────┐
│ Client  │          │      Sync Server        │          │    DB    │
└────┬────┘          └────────────┬────────────┘          └────┬─────┘
     │                            │                             │
     │  GET /files                │                             │
     │  X-API-Key: sk_store_...   │                             │
     │ ──────────────────────────>│                             │
     │                            │                             │
     │                            │  Query: api_keys            │
     │                            │  WHERE key_hash = hash(key) │
     │                            │ ───────────────────────────>│
     │                            │                             │
     │                            │  API key + store + perms    │
     │                            │ <───────────────────────────│
     │                            │                             │
     │                            │  Check: 'read' in perms?    │
     │                            │                             │
     │  200 OK + file list        │                             │
     │ <──────────────────────────│                             │
     │                            │                             │
```

### WebSocket

```
┌─────────┐          ┌─────────────────────────┐          ┌──────────┐
│ Client  │          │      Sync Server        │          │    DB    │
└────┬────┘          └────────────┬────────────┘          └────┬─────┘
     │                            │                             │
     │  Socket.io connect         │                             │
     │  ?apiKey=sk_store_...      │                             │
     │ ──────────────────────────>│                             │
     │                            │                             │
     │                            │  Validate key (same as REST)│
     │                            │ ───────────────────────────>│
     │                            │                             │
     │                            │  Key valid, store: xyz      │
     │                            │ <───────────────────────────│
     │                            │                             │
     │                            │  Join room: store:xyz       │
     │                            │  Store perms in socket.data │
     │                            │                             │
     │  Connected                 │                             │
     │ <──────────────────────────│                             │
     │                            │                             │
```

---

## Authorization Checks

### REST Endpoint Authorization

```typescript
// src/middleware/auth.ts
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const apiKey = request.headers["x-api-key"];

  if (!apiKey || typeof apiKey !== "string") {
    throw new UnauthorizedError("API key required");
  }

  const keyHash = hashApiKey(apiKey);
  const keyRecord = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)),
    with: { store: true },
  });

  if (!keyRecord) {
    throw new UnauthorizedError("Invalid API key");
  }

  // Attach to request for route handlers
  request.auth = {
    storeId: keyRecord.storeId,
    permissions: keyRecord.permissions,
    keyId: keyRecord.id,
  };

  // Update last used timestamp (async, don't await)
  updateLastUsed(keyRecord.id);
}
```

### Permission Decorator

```typescript
// src/middleware/permissions.ts
export function requirePermission(permission: "read" | "write") {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.auth.permissions.includes(permission)) {
      throw new ForbiddenError(`${permission} permission required`);
    }
  };
}

// Usage in routes
app.get("/files", {
  preHandler: [authMiddleware, requirePermission("read")],
  handler: listFilesHandler,
});
```

### WebSocket Authorization

```typescript
// src/socket/auth.ts
io.use(async (socket, next) => {
  const apiKey = socket.handshake.query.apiKey;

  if (!apiKey || typeof apiKey !== "string") {
    return next(new Error("UNAUTHORIZED"));
  }

  const keyRecord = await validateApiKey(apiKey);
  if (!keyRecord) {
    return next(new Error("INVALID_KEY"));
  }

  // Store auth info in socket
  socket.data.storeId = keyRecord.storeId;
  socket.data.permissions = keyRecord.permissions;

  // Join store room
  socket.join(`store:${keyRecord.storeId}`);

  next();
});

// Event handler with permission check
socket.on("created-file", async (payload, callback) => {
  if (!socket.data.permissions.includes("write")) {
    return callback({
      success: false,
      error: { code: "FORBIDDEN", message: "Write permission required" },
    });
  }
  // ... handle event
});
```

---

## Store Isolation

Each store is completely isolated:

1. **Data isolation**: Files in one store cannot be accessed from another
2. **Key isolation**: API keys are scoped to a single store
3. **Room isolation**: WebSocket broadcasts go only to clients in the same store

### Isolation Enforcement

```typescript
// All file queries include storeId
const file = await db.query.files.findFirst({
  where: and(
    eq(files.storeId, request.auth.storeId), // Always filter by store
    eq(files.path, path),
  ),
});
```

---

## Input Validation

All inputs are validated using Zod schemas:

```typescript
// src/schemas/file.ts
import { z } from "zod";

export const createFileSchema = z.object({
  path: z
    .string()
    .min(1, "Path is required")
    .max(1000, "Path too long")
    .regex(/^[^<>:"|?*\x00-\x1f]+$/, "Invalid path characters"),
  content: z.string().max(10 * 1024 * 1024, "Content too large (max 10MB)"),
});

export const filePathSchema = z
  .string()
  .min(1)
  .max(1000)
  .regex(/^[^<>:"|?*\x00-\x1f]+$/);
```

---

## Security Considerations

### Rate Limiting

Consider adding rate limiting for:

- Failed authentication attempts
- API key creation
- File operations

```typescript
// Example with fastify-rate-limit
app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
  keyGenerator: (request) => request.auth?.storeId || request.ip,
});
```

### CORS

Configure CORS appropriately for production:

```typescript
app.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(",") || false,
  credentials: true,
});
```

### HTTPS

Always use HTTPS in production. TLS termination at:

- Reverse proxy (nginx, Caddy)
- Load balancer
- Or directly in Node.js

### Key Rotation

Consider implementing:

- Key expiration dates
- Automatic key rotation reminders
- Audit logging for key usage
