import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAuth, requirePermission } from "../middleware/auth";
import {
  validate,
  settingUpsertSchema,
  settingPathQuerySchema,
} from "../schemas";

import {
  listSettings,
  getSettingOrThrow,
  upsertSetting,
  deleteSetting,
  deleteAllSettings,
} from "../services/settings";

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", requireAuth);

  /**
   * GET /
   * Dual-purpose:
   * - If `path` query param provided: return single setting with content
   * - Otherwise: return list of all active settings (metadata only)
   */
  fastify.get(
    "/",
    { preHandler: requirePermission("settings_read") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.auth!;
      const query = request.query as Record<string, unknown>;

      const hasPath = typeof query.path === "string" && query.path.length > 0;

      if (hasPath) {
        const { path } = validate(settingPathQuerySchema, query);
        const setting = await getSettingOrThrow(storeId, path);

        return reply.send({
          path: setting.path,
          content: setting.content,
          hash: setting.hash,
          size: setting.size,
          isBinary: setting.isBinary,
          extension: setting.extension,
          createdAt: setting.createdAt.toISOString(),
          updatedAt: setting.updatedAt.toISOString(),
        });
      }

      const settingList = await listSettings(storeId);

      return reply.send({
        settings: settingList.map((s) => ({
          path: s.path,
          hash: s.hash,
          size: s.size,
          isBinary: s.isBinary,
          extension: s.extension,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        })),
        total: settingList.length,
      });
    },
  );

  /**
   * PUT /
   * Upsert a single setting.
   */
  fastify.put(
    "/",
    { preHandler: requirePermission("settings_write") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.auth!;
      const data = validate(settingUpsertSchema, request.body);

      const setting = await upsertSetting(storeId, data.path, data.content);

      return reply.send({
        path: setting.path,
        hash: setting.hash,
        size: setting.size,
        isBinary: setting.isBinary,
        extension: setting.extension,
        createdAt: setting.createdAt.toISOString(),
        updatedAt: setting.updatedAt.toISOString(),
      });
    },
  );

  /**
   * DELETE /all
   * Soft-delete all settings in the store.
   */
  fastify.delete(
    "/all",
    { preHandler: requirePermission("settings_write") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.auth!;
      const count = await deleteAllSettings(storeId);
      return reply.send({ deleted: count });
    },
  );

  /**
   * DELETE /
   * Soft-delete a single setting by path.
   */
  fastify.delete(
    "/",
    { preHandler: requirePermission("settings_write") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.auth!;
      const { path } = validate(settingPathQuerySchema, request.query);

      await deleteSetting(storeId, path);

      return reply.status(204).send();
    },
  );
}
