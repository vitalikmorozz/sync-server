import fastify from "fastify";
import cors from "@fastify/cors";
import { registerRoutes } from "./routes";
import { ApiError } from "./errors";
import { initializeSocket, type TypedServer } from "./socket";

const app = fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
  },
});

app.register(cors, {
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : ["app://obsidian.md", "http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-API-Key"],
  credentials: true,
});

let io: TypedServer;

app.setErrorHandler((error, request, reply) => {
  if (error instanceof ApiError) {
    request.log.warn({ err: error }, error.message);
    return reply.status(error.statusCode).send(error.toJSON());
  }

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

  request.log.error({ err: error }, "Unexpected error");
  return reply.status(500).send({
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    },
  });
});

app.register(registerRoutes);

app.ready((err) => {
  if (err) throw err;
  io = initializeSocket(app.server);
  app.log.info("Socket.io initialized");
});

export function getSocketServer(): TypedServer {
  return io;
}

export { app, io };
export default app;
