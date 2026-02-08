import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { createAuthMiddleware } from "./auth";
import { registerSocketHandlers } from "./handlers";
import { socketLogger } from "./logger";
import type { TypedServer, AuthenticatedSocket } from "./types";

// Re-export types
export * from "./types";
export { getStoreRoom, hasPermission } from "./auth";
export { socketLogger, createSocketLogger } from "./logger";

/**
 * Initialize Socket.io server with authentication and event handlers
 */
export function initializeSocket(httpServer: HttpServer): TypedServer {
  const io: TypedServer = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGINS?.split(",") || "*",
      methods: ["GET", "POST"],
    },
  });

  socketLogger.info("Initializing Socket.io server");

  // Register authentication middleware
  io.use(createAuthMiddleware(io));

  // Handle new connections
  io.on("connection", (socket: AuthenticatedSocket) => {
    registerSocketHandlers(socket, io);
  });

  // Log when the engine has an error
  io.engine.on("connection_error", (err) => {
    socketLogger.error(
      {
        code: err.code,
        message: err.message,
        context: err.context,
      },
      "Socket.io engine connection error",
    );
  });

  socketLogger.info(
    { cors: process.env.CORS_ORIGINS || "*" },
    "Socket.io server initialized",
  );

  return io;
}

/**
 * Broadcast a file event to all clients in a store
 * Useful for REST API handlers to notify WebSocket clients
 */
export function broadcastToStore(
  io: TypedServer,
  storeId: string,
  event: "file-created" | "file-modified" | "file-deleted" | "file-renamed",
  data: unknown,
): void {
  const room = `store:${storeId}`;
  socketLogger.debug(
    { storeId, event, room },
    "Broadcasting event to store room",
  );
  io.to(room).emit(event, data as never);
}
