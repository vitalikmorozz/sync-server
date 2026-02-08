import fastify from "fastify";
import cors from "@fastify/cors";
import { registerRoutes } from "./routes";
import { ApiError } from "./errors";
import { initializeSocket, type TypedServer } from "./socket";

// Create Fastify instance
const app = fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
  },
});

// Register CORS - allow Obsidian app and configurable origins
app.register(cors, {
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : ["app://obsidian.md", "http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-API-Key"],
  credentials: true,
});

// Socket.io server instance (initialized after app is ready)
let io: TypedServer;

// Global error handler for API errors
app.setErrorHandler((error, request, reply) => {
  if (error instanceof ApiError) {
    request.log.warn({ err: error }, error.message);
    return reply.status(error.statusCode).send(error.toJSON());
  }

  // Handle Fastify validation errors
  if (error.validation) {
    request.log.warn({ err: error }, "Validation error");
    return reply.status(400).send({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: { errors: error.validation },
      },
    });
  }

  // Log unexpected errors
  request.log.error({ err: error }, "Unexpected error");
  return reply.status(500).send({
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    },
  });
});

// Register all routes
app.register(registerRoutes);

// Initialize Socket.io after Fastify server is ready
app.ready((err) => {
  if (err) throw err;

  // Initialize Socket.io with authentication and event handlers
  io = initializeSocket(app.server);

  app.log.info("Socket.io initialized with authentication");
});

/**
 * Get the Socket.io server instance
 * Use this to broadcast events from REST API handlers
 */
export function getSocketServer(): TypedServer {
  return io;
}

export { app, io };
export default app;
