import { FastifyRequest, FastifyReply } from "fastify";
import { eq, isNull, and } from "drizzle-orm";
import { db, apiKeys } from "../db";
import { hashApiKey, isAdminKey } from "../utils/apiKey";
import { UnauthorizedError, ForbiddenError } from "../errors";
import type { Permission } from "../db/schema";

// Extend FastifyRequest to include auth info
declare module "fastify" {
  interface FastifyRequest {
    auth?: {
      storeId: string;
      permissions: Permission[];
      keyId: string;
    };
  }
}

/**
 * Get the configured admin API key from environment
 */
function getAdminApiKey(): string | undefined {
  return process.env.ADMIN_API_KEY;
}

/**
 * Extract API key from request headers
 */
function extractApiKey(request: FastifyRequest): string | null {
  const header = request.headers["x-api-key"];
  if (typeof header === "string" && header.length > 0) {
    return header;
  }
  return null;
}

/**
 * Middleware that requires admin authentication
 * Validates the X-API-Key header against the configured ADMIN_API_KEY
 */
export async function requireAdmin(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const apiKey = extractApiKey(request);

  if (!apiKey) {
    throw new UnauthorizedError("API key required");
  }

  const adminKey = getAdminApiKey();
  if (!adminKey) {
    throw new UnauthorizedError("Admin API key not configured");
  }

  if (!isAdminKey(apiKey)) {
    throw new ForbiddenError("Admin API key required");
  }

  if (apiKey !== adminKey) {
    throw new UnauthorizedError("Invalid admin API key");
  }
}

/**
 * Middleware that requires store-level authentication
 * Validates the X-API-Key header against stored API keys
 */
export async function requireAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const apiKey = extractApiKey(request);

  if (!apiKey) {
    throw new UnauthorizedError("API key required");
  }

  const keyHash = hashApiKey(apiKey);

  const keyRecord = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)),
  });

  if (!keyRecord) {
    throw new UnauthorizedError("Invalid API key");
  }

  // Attach auth info to request
  request.auth = {
    storeId: keyRecord.storeId,
    permissions: keyRecord.permissions as Permission[],
    keyId: keyRecord.id,
  };

  // Update last used timestamp asynchronously (don't await)
  updateLastUsed(keyRecord.id).catch((err) => {
    request.log.error(
      { err, keyId: keyRecord.id },
      "Failed to update last used",
    );
  });
}

/**
 * Create a middleware that requires a specific permission
 */
export function requirePermission(permission: Permission) {
  return async (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> => {
    if (!request.auth) {
      throw new UnauthorizedError("Authentication required");
    }

    if (!request.auth.permissions.includes(permission)) {
      throw new ForbiddenError(`${permission} permission required`);
    }
  };
}

/**
 * Update the last_used_at timestamp for an API key
 */
async function updateLastUsed(keyId: string): Promise<void> {
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyId));
}
