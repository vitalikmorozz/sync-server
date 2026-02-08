import { eq, and, isNull } from "drizzle-orm";
import type { ExtendedError } from "socket.io";
import { db, apiKeys } from "../db";
import { hashApiKey, isStoreKey } from "../utils/apiKey";
import { socketLogger } from "./logger";
import type { AuthenticatedSocket, TypedServer } from "./types";

/**
 * Error codes for socket authentication failures
 */
export const SocketAuthError = {
  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_KEY: "INVALID_KEY",
  KEY_REVOKED: "KEY_REVOKED",
} as const;

/**
 * Get store room name from store ID
 */
export function getStoreRoom(storeId: string): string {
  return `store:${storeId}`;
}

/**
 * Socket.io authentication middleware
 * Validates API key from query parameters and attaches auth data to socket
 */
export function createAuthMiddleware(_io: TypedServer) {
  return async (
    socket: AuthenticatedSocket,
    next: (err?: ExtendedError) => void,
  ) => {
    const socketId = socket.id;
    const clientIp = socket.handshake.address;

    try {
      const apiKey = socket.handshake.query.apiKey;

      // Check if API key is provided
      if (!apiKey || typeof apiKey !== "string") {
        socketLogger.warn(
          { socketId, clientIp },
          "Connection rejected: No API key provided",
        );
        return next(new Error(SocketAuthError.UNAUTHORIZED));
      }

      // Validate it's a store key format
      if (!isStoreKey(apiKey)) {
        socketLogger.warn(
          { socketId, clientIp, keyPrefix: apiKey.substring(0, 12) },
          "Connection rejected: Invalid key format",
        );
        return next(new Error(SocketAuthError.INVALID_KEY));
      }

      // Hash the key and look it up
      const keyHash = hashApiKey(apiKey);
      const keyPrefix = apiKey.substring(0, 16);

      const keyRecord = await db.query.apiKeys.findFirst({
        where: and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)),
      });

      // Key not found
      if (!keyRecord) {
        socketLogger.warn(
          { socketId, clientIp, keyPrefix },
          "Connection rejected: API key not found or revoked",
        );
        return next(new Error(SocketAuthError.INVALID_KEY));
      }

      // Store auth info in socket data
      socket.data.storeId = keyRecord.storeId;
      socket.data.permissions = keyRecord.permissions;
      socket.data.keyId = keyRecord.id;

      // Join the store-specific room
      const room = getStoreRoom(keyRecord.storeId);
      socket.join(room);

      socketLogger.info(
        {
          socketId,
          clientIp,
          storeId: keyRecord.storeId,
          keyPrefix,
          permissions: keyRecord.permissions,
          room,
        },
        "Socket authenticated and joined room",
      );

      // Update last used timestamp asynchronously
      updateLastUsed(keyRecord.id).catch((err) => {
        socketLogger.error(
          { err, keyId: keyRecord.id },
          "Failed to update API key last used timestamp",
        );
      });

      next();
    } catch (error) {
      socketLogger.error(
        { err: error, socketId, clientIp },
        "Socket authentication error",
      );
      next(new Error(SocketAuthError.UNAUTHORIZED));
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

/**
 * Check if socket has the required permission
 */
export function hasPermission(
  socket: AuthenticatedSocket,
  permission: "read" | "write",
): boolean {
  return socket.data.permissions?.includes(permission) ?? false;
}
