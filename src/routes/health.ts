import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { testConnection } from "../db";

// Track server start time for uptime calculation
const startTime = Date.now();

/**
 * Health check routes
 * No authentication required
 */
export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /health - Health check endpoint
   */
  fastify.get(
    "/health",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      let dbHealthy = false;

      try {
        dbHealthy = await testConnection();
      } catch (error) {
        fastify.log.error({ error }, "Database health check failed");
      }

      const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

      const health = {
        status: dbHealthy ? "healthy" : "degraded",
        version: process.env.npm_package_version || "0.1.0",
        uptime: uptimeSeconds,
        database: dbHealthy ? "connected" : "disconnected",
      };

      const statusCode = dbHealthy ? 200 : 503;
      return reply.status(statusCode).send(health);
    },
  );
}
