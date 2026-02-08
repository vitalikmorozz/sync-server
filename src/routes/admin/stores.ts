import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAdmin } from "../../middleware/auth";
import { validate, createStoreSchema } from "../../schemas";
import * as storesService from "../../services/stores";

/**
 * Admin routes for managing stores
 * All routes require admin authentication
 */
export async function storesRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply admin auth to all routes in this plugin
  fastify.addHook("preHandler", requireAdmin);

  /**
   * GET /admin/stores - List all stores
   */
  fastify.get("/", async (_request: FastifyRequest, reply: FastifyReply) => {
    const stores = await storesService.listStores();
    return reply.send({ stores });
  });

  /**
   * GET /admin/stores/:storeId - Get a specific store
   */
  fastify.get(
    "/:storeId",
    async (
      request: FastifyRequest<{ Params: { storeId: string } }>,
      reply: FastifyReply,
    ) => {
      const { storeId } = request.params;
      const store = await storesService.getStoreWithStats(storeId);
      return reply.send(store);
    },
  );

  /**
   * POST /admin/stores - Create a new store
   */
  fastify.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const data = validate(createStoreSchema, request.body);
    const store = await storesService.createStore(data);
    return reply.status(201).send(store);
  });

  /**
   * DELETE /admin/stores/:storeId - Delete a store
   */
  fastify.delete(
    "/:storeId",
    async (
      request: FastifyRequest<{ Params: { storeId: string } }>,
      reply: FastifyReply,
    ) => {
      const { storeId } = request.params;
      await storesService.deleteStore(storeId);
      return reply.status(204).send();
    },
  );
}
