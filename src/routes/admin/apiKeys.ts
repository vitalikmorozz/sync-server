import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAdmin } from "../../middleware/auth";
import { validate, createApiKeySchema } from "../../schemas";
import * as apiKeysService from "../../services/apiKeys";

interface StoreParams {
  storeId: string;
}

interface KeyParams extends StoreParams {
  keyId: string;
}

/**
 * Admin routes for managing API keys
 * All routes require admin authentication
 */
export async function apiKeysRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply admin auth to all routes in this plugin
  fastify.addHook("preHandler", requireAdmin);

  /**
   * GET /admin/stores/:storeId/keys - List all API keys for a store
   */
  fastify.get(
    "/",
    async (
      request: FastifyRequest<{ Params: StoreParams }>,
      reply: FastifyReply,
    ) => {
      const { storeId } = request.params;
      const keys = await apiKeysService.listApiKeys(storeId);
      return reply.send({ keys });
    },
  );

  /**
   * GET /admin/stores/:storeId/keys/:keyId - Get a specific API key
   */
  fastify.get(
    "/:keyId",
    async (
      request: FastifyRequest<{ Params: KeyParams }>,
      reply: FastifyReply,
    ) => {
      const { storeId, keyId } = request.params;
      const key = await apiKeysService.getApiKey(storeId, keyId);
      return reply.send(key);
    },
  );

  /**
   * POST /admin/stores/:storeId/keys - Create a new API key
   */
  fastify.post(
    "/",
    async (
      request: FastifyRequest<{ Params: StoreParams }>,
      reply: FastifyReply,
    ) => {
      const { storeId } = request.params;
      const data = validate(createApiKeySchema, request.body);
      const key = await apiKeysService.createApiKey(storeId, data);
      return reply.status(201).send(key);
    },
  );

  /**
   * DELETE /admin/stores/:storeId/keys/:keyId - Revoke an API key
   */
  fastify.delete(
    "/:keyId",
    async (
      request: FastifyRequest<{ Params: KeyParams }>,
      reply: FastifyReply,
    ) => {
      const { storeId, keyId } = request.params;
      await apiKeysService.revokeApiKey(storeId, keyId);
      return reply.status(204).send();
    },
  );
}
