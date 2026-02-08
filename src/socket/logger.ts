import pino from "pino";

/**
 * Socket-specific logger with structured logging
 * Uses the same log level as the main app
 */
export const socketLogger = pino({
  name: "socket",
  level: process.env.LOG_LEVEL || "info",
});

/**
 * Create a child logger with socket context
 */
export function createSocketLogger(socketId: string, storeId?: string) {
  return socketLogger.child({
    socketId,
    ...(storeId && { storeId }),
  });
}
