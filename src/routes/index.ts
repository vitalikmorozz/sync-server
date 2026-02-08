import { FastifyInstance } from "fastify";
import { storesRoutes } from "./admin/stores";
import { apiKeysRoutes } from "./admin/apiKeys";
import { healthRoutes } from "./health";

/**
 * Register all application routes
 */
export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Health check (no prefix, no auth)
  await fastify.register(healthRoutes);

  // Admin routes
  await fastify.register(storesRoutes, { prefix: "/api/v1/admin/stores" });

  // API keys are nested under stores
  await fastify.register(apiKeysRoutes, {
    prefix: "/api/v1/admin/stores/:storeId/keys",
  });
}
