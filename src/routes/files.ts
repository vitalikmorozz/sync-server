import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAuth, requirePermission } from "../middleware/auth";
import {
  validate,
  createFileSchema,
  updateFileSchema,
  renameFileSchema,
  listFilesQuerySchema,
  filePathQuerySchema,
} from "../schemas";

import {
  listFilesWithPagination,
  getFileWithContent,
  createFileStrict,
  updateFile,
  deleteFile,
  deleteAllFiles,
  renameFile,
} from "../services/files";
import { getSocketServer } from "../app";
import { broadcastToStore } from "../socket";

export async function filesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", requireAuth);

  fastify.get(
    "/",
    { preHandler: requirePermission("read") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.auth!;
      const query = request.query as Record<string, unknown>;

      const hasPath = typeof query.path === "string" && query.path.length > 0;
      const hasPaginationParams =
        query.limit !== undefined || query.offset !== undefined;

      if (hasPath && !hasPaginationParams) {
        const { path } = validate(filePathQuerySchema, query);
        const file = await getFileWithContent(storeId, path);

        return reply.send({
          path: file.path,
          content: file.content,
          hash: file.hash,
          size: file.size,
          isBinary: file.isBinary,
          extension: file.extension,
          createdAt: file.createdAt.toISOString(),
          updatedAt: file.updatedAt.toISOString(),
        });
      }

      const listQuery = validate(listFilesQuerySchema, query);

      const result = await listFilesWithPagination(storeId, {
        pathPrefix: listQuery.path,
        limit: listQuery.limit,
        offset: listQuery.offset,
        includeDeleted: listQuery.include_deleted,
        extension: listQuery.extension,
        contentContains: listQuery.content_contains,
        pathContains: listQuery.path_contains,
        isBinary: listQuery.is_binary,
      });

      return reply.send({
        files: result.files.map((f) => ({
          path: f.path,
          hash: f.hash,
          size: f.size,
          isBinary: f.isBinary,
          extension: f.extension,
          createdAt: f.createdAt.toISOString(),
          updatedAt: f.updatedAt.toISOString(),
          ...(f.expiresAt ? { expiresAt: f.expiresAt.toISOString() } : {}),
        })),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      });
    },
  );

  fastify.post(
    "/",
    { preHandler: requirePermission("write") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.auth!;
      const data = validate(createFileSchema, request.body);

      const file = await createFileStrict(storeId, data);

      const io = getSocketServer();
      if (io) {
        broadcastToStore(io, storeId, "file-created", {
          path: file.path,
          content: file.content,
          hash: file.hash,
          size: file.size,
          isBinary: file.isBinary,
          extension: file.extension,
          createdAt: file.createdAt.toISOString(),
        });
      }

      return reply.status(201).send({
        path: file.path,
        hash: file.hash,
        size: file.size,
        isBinary: file.isBinary,
        extension: file.extension,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
      });
    },
  );

  fastify.put(
    "/",
    { preHandler: requirePermission("write") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.auth!;
      const data = validate(updateFileSchema, request.body);

      const file = await updateFile(storeId, data.path, data.content);

      const io = getSocketServer();
      if (io) {
        if (file.created) {
          broadcastToStore(io, storeId, "file-created", {
            path: file.path,
            content: file.content,
            hash: file.hash,
            size: file.size,
            isBinary: file.isBinary,
            extension: file.extension,
            createdAt: file.createdAt.toISOString(),
          });
        } else {
          broadcastToStore(io, storeId, "file-modified", {
            path: file.path,
            content: file.content,
            hash: file.hash,
            size: file.size,
            isBinary: file.isBinary,
            extension: file.extension,
            updatedAt: file.updatedAt.toISOString(),
          });
        }
      }

      return reply.send({
        path: file.path,
        hash: file.hash,
        size: file.size,
        isBinary: file.isBinary,
        extension: file.extension,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
      });
    },
  );

  fastify.delete(
    "/all",
    { preHandler: requirePermission("write") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.auth!;
      const { count } = await deleteAllFiles(storeId);
      return reply.send({ deleted: count });
    },
  );

  fastify.delete(
    "/",
    { preHandler: requirePermission("write") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.auth!;
      const { path } = validate(filePathQuerySchema, request.query);

      const { deleted } = await deleteFile(storeId, path);

      if (deleted) {
        const io = getSocketServer();
        if (io) {
          broadcastToStore(io, storeId, "file-deleted", {
            path,
            deletedAt: new Date().toISOString(),
          });
        }
      }

      return reply.status(204).send();
    },
  );

  fastify.patch(
    "/",
    { preHandler: requirePermission("write") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.auth!;
      const data = validate(renameFileSchema, request.body);

      const file = await renameFile(storeId, data.path, data.newPath);

      const io = getSocketServer();
      if (io) {
        if (file.created) {
          broadcastToStore(io, storeId, "file-created", {
            path: file.path,
            content: file.content,
            hash: file.hash,
            size: file.size,
            isBinary: file.isBinary,
            extension: file.extension,
            createdAt: file.createdAt.toISOString(),
          });
        } else {
          broadcastToStore(io, storeId, "file-renamed", {
            oldPath: data.path,
            newPath: file.path,
            content: file.content,
            hash: file.hash,
            size: file.size,
            isBinary: file.isBinary,
            extension: file.extension,
            updatedAt: file.updatedAt.toISOString(),
          });
        }
      }

      return reply.send({
        path: file.path,
        hash: file.hash,
        size: file.size,
        isBinary: file.isBinary,
        extension: file.extension,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
      });
    },
  );
}
