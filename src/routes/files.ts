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

// Note: filePathQuerySchema is used for GET (single file) and DELETE
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

/**
 * Files API routes
 * Base path: /api/v1/files
 *
 * All endpoints use query parameter `path` to specify the file path.
 */
export async function filesRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply store-level authentication to all routes
  fastify.addHook("preHandler", requireAuth);

  // ============================================
  // GET /files - List files or get single file
  // ============================================
  // Without ?path= : List files with optional prefix filter
  // With ?path= : Get specific file content
  fastify.get(
    "/",
    { preHandler: requirePermission("read") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.auth!;
      const query = request.query as Record<string, unknown>;

      // If path is provided and doesn't look like a prefix filter (no pagination params),
      // treat it as a single file request
      const hasPath = typeof query.path === "string" && query.path.length > 0;
      const hasPaginationParams =
        query.limit !== undefined || query.offset !== undefined;

      if (hasPath && !hasPaginationParams) {
        // Single file request
        const { path } = validate(filePathQuerySchema, query);
        const file = await getFileWithContent(storeId, path);

        return reply.send({
          path: file.path,
          content: file.content,
          hash: file.hash,
          size: file.size,
          createdAt: file.createdAt.toISOString(),
          updatedAt: file.updatedAt.toISOString(),
        });
      }

      // List files with optional path prefix filter
      const listQuery = validate(listFilesQuerySchema, query);

      const result = await listFilesWithPagination(storeId, {
        pathPrefix: listQuery.path,
        limit: listQuery.limit,
        offset: listQuery.offset,
      });

      return reply.send({
        files: result.files.map((f) => ({
          path: f.path,
          hash: f.hash,
          size: f.size,
          createdAt: f.createdAt.toISOString(),
          updatedAt: f.updatedAt.toISOString(),
        })),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      });
    },
  );

  // ============================================
  // POST /files - Create file
  // ============================================
  fastify.post(
    "/",
    { preHandler: requirePermission("write") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.auth!;
      const data = validate(createFileSchema, request.body);

      const file = await createFileStrict(storeId, data);

      // Broadcast to WebSocket clients (with content)
      const io = getSocketServer();
      if (io) {
        broadcastToStore(io, storeId, "file-created", {
          path: file.path,
          content: file.content,
          hash: file.hash,
          size: file.size,
          createdAt: file.createdAt.toISOString(),
        });
      }

      return reply.status(201).send({
        path: file.path,
        hash: file.hash,
        size: file.size,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
      });
    },
  );

  // ============================================
  // PUT /files - Update file (upsert)
  // ============================================
  fastify.put(
    "/",
    { preHandler: requirePermission("write") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.auth!;
      const data = validate(updateFileSchema, request.body);

      const file = await updateFile(storeId, data.path, data.content);

      // Broadcast to WebSocket clients (with content)
      const io = getSocketServer();
      if (io) {
        if (file.created) {
          broadcastToStore(io, storeId, "file-created", {
            path: file.path,
            content: file.content,
            hash: file.hash,
            size: file.size,
            createdAt: file.createdAt.toISOString(),
          });
        } else {
          broadcastToStore(io, storeId, "file-modified", {
            path: file.path,
            content: file.content,
            hash: file.hash,
            size: file.size,
            updatedAt: file.updatedAt.toISOString(),
          });
        }
      }

      return reply.send({
        path: file.path,
        hash: file.hash,
        size: file.size,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
      });
    },
  );

  // ============================================
  // DELETE /files/all - Delete all files in store
  // ============================================
  fastify.delete(
    "/all",
    { preHandler: requirePermission("write") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.auth!;

      const { count } = await deleteAllFiles(storeId);

      // No broadcast - this is a bulk operation, clients will resync

      return reply.send({ deleted: count });
    },
  );

  // ============================================
  // DELETE /files?path= - Delete file
  // ============================================
  fastify.delete(
    "/",
    { preHandler: requirePermission("write") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.auth!;
      const { path } = validate(filePathQuerySchema, request.query);

      const { deleted } = await deleteFile(storeId, path);

      // Broadcast to WebSocket clients only if file was actually deleted
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

  // ============================================
  // PATCH /files - Rename/move file
  // ============================================
  fastify.patch(
    "/",
    { preHandler: requirePermission("write") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.auth!;
      const data = validate(renameFileSchema, request.body);

      const file = await renameFile(storeId, data.path, data.newPath);

      // Broadcast to WebSocket clients (with content)
      const io = getSocketServer();
      if (io) {
        if (file.created) {
          // Source didn't exist, created new file at target
          broadcastToStore(io, storeId, "file-created", {
            path: file.path,
            content: file.content,
            hash: file.hash,
            size: file.size,
            createdAt: file.createdAt.toISOString(),
          });
        } else {
          // Normal rename
          broadcastToStore(io, storeId, "file-renamed", {
            oldPath: data.path,
            newPath: file.path,
            content: file.content,
            hash: file.hash,
            size: file.size,
            updatedAt: file.updatedAt.toISOString(),
          });
        }
      }

      return reply.send({
        path: file.path,
        hash: file.hash,
        size: file.size,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
      });
    },
  );
}
