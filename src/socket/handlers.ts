import { z } from "zod";
import { hasPermission, getStoreRoom } from "./auth";
import { createSocketLogger } from "./logger";
import {
  createFile,
  updateFile,
  deleteFile,
  renameFile,
} from "../services/files";
import type {
  AuthenticatedSocket,
  TypedServer,
  AckCallback,
  AckResponse,
  CreatedFilePayload,
  ModifiedFilePayload,
  DeletedFilePayload,
  RenamedFilePayload,
} from "./types";

// ============================================
// Validation Schemas
// ============================================

const pathSchema = z
  .string()
  .min(1, "Path is required")
  .max(1000, "Path too long")
  .regex(/^[^<>:"|?*\x00-\x1f]+$/, "Invalid path characters");

const contentSchema = z
  .string()
  .max(10 * 1024 * 1024, "Content too large (max 10MB)");

// created-file only requires path (content defaults to empty)
const createdFileSchema = z.object({
  path: pathSchema,
});

const modifiedFileSchema = z.object({
  path: pathSchema,
  content: contentSchema,
});

const deletedFileSchema = z.object({
  path: pathSchema,
});

const renamedFileSchema = z.object({
  oldPath: pathSchema,
  newPath: pathSchema,
});

// ============================================
// Error Response Helpers
// ============================================

function errorResponse(code: string, message: string): AckResponse {
  return {
    success: false,
    error: { code, message },
  };
}

function forbiddenResponse(): AckResponse {
  return errorResponse("FORBIDDEN", "Write permission required");
}

function validationError(message: string): AckResponse {
  return errorResponse("VALIDATION_ERROR", message);
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle created-file event
 * Discovers/creates a file with empty content (idempotent)
 */
async function handleCreatedFile(
  socket: AuthenticatedSocket,
  _io: TypedServer,
  payload: CreatedFilePayload,
  callback: AckCallback,
): Promise<void> {
  const log = createSocketLogger(socket.id, socket.data.storeId);

  // Check write permission
  if (!hasPermission(socket, "write")) {
    log.warn(
      { event: "created-file", path: payload.path },
      "Permission denied: write required",
    );
    return callback(forbiddenResponse());
  }

  // Validate payload
  const result = createdFileSchema.safeParse(payload);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid payload";
    log.warn(
      { event: "created-file", validationError: message },
      "Validation failed",
    );
    return callback(validationError(message));
  }

  try {
    const { path } = result.data;
    const storeId = socket.data.storeId;
    const room = getStoreRoom(storeId);

    log.info({ event: "created-file", path }, "Discovering/creating file");

    // Create the file (returns existing if already exists)
    const file = await createFile(storeId, path);

    if (file.created) {
      log.info(
        { event: "created-file", path, hash: file.hash },
        "File created (new)",
      );

      // Broadcast to other clients in the store room (with content)
      socket.to(room).emit("file-created", {
        path: file.path,
        content: file.content,
        hash: file.hash,
        size: file.size,
        createdAt: file.createdAt.toISOString(),
      });

      log.debug(
        { event: "file-created", path, room },
        "Broadcast sent to room",
      );
    } else {
      log.info(
        { event: "created-file", path, hash: file.hash },
        "File already exists (no-op)",
      );
    }

    // Send success response to caller
    callback({ success: true, hash: file.hash });
  } catch (error) {
    log.error(
      { err: error, event: "created-file", path: payload.path },
      "Failed to create file",
    );
    callback(errorResponse("INTERNAL_ERROR", "Failed to create file"));
  }
}

/**
 * Handle modified-file event
 * Updates file content, creates if doesn't exist
 */
async function handleModifiedFile(
  socket: AuthenticatedSocket,
  _io: TypedServer,
  payload: ModifiedFilePayload,
  callback: AckCallback,
): Promise<void> {
  const log = createSocketLogger(socket.id, socket.data.storeId);

  // Check write permission
  if (!hasPermission(socket, "write")) {
    log.warn(
      { event: "modified-file", path: payload.path },
      "Permission denied: write required",
    );
    return callback(forbiddenResponse());
  }

  // Validate payload
  const result = modifiedFileSchema.safeParse(payload);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid payload";
    log.warn(
      { event: "modified-file", validationError: message },
      "Validation failed",
    );
    return callback(validationError(message));
  }

  try {
    const { path, content } = result.data;
    const storeId = socket.data.storeId;
    const room = getStoreRoom(storeId);
    const contentSize = Buffer.byteLength(content, "utf8");

    log.info({ event: "modified-file", path, contentSize }, "Modifying file");

    // Update the file (creates if doesn't exist)
    const file = await updateFile(storeId, path, content);

    if (file.created) {
      log.info(
        { event: "modified-file", path, hash: file.hash, size: file.size },
        "File created (did not exist)",
      );

      // Broadcast file-created since it was a new file (with content)
      socket.to(room).emit("file-created", {
        path: file.path,
        content: file.content,
        hash: file.hash,
        size: file.size,
        createdAt: file.createdAt.toISOString(),
      });

      log.debug(
        { event: "file-created", path, room },
        "Broadcast sent to room",
      );
    } else {
      log.info(
        { event: "modified-file", path, hash: file.hash, size: file.size },
        "File modified successfully",
      );

      // Broadcast to other clients in the store room (with content)
      socket.to(room).emit("file-modified", {
        path: file.path,
        content: file.content,
        hash: file.hash,
        size: file.size,
        updatedAt: file.updatedAt.toISOString(),
      });

      log.debug(
        { event: "file-modified", path, room },
        "Broadcast sent to room",
      );
    }

    // Send success response to caller
    callback({ success: true, hash: file.hash });
  } catch (error) {
    log.error(
      { err: error, event: "modified-file", path: payload.path },
      "Failed to modify file",
    );
    callback(errorResponse("INTERNAL_ERROR", "Failed to modify file"));
  }
}

/**
 * Handle deleted-file event
 * Deletes a file, ignores if file doesn't exist
 */
async function handleDeletedFile(
  socket: AuthenticatedSocket,
  _io: TypedServer,
  payload: DeletedFilePayload,
  callback: AckCallback,
): Promise<void> {
  const log = createSocketLogger(socket.id, socket.data.storeId);

  // Check write permission
  if (!hasPermission(socket, "write")) {
    log.warn(
      { event: "deleted-file", path: payload.path },
      "Permission denied: write required",
    );
    return callback(forbiddenResponse());
  }

  // Validate payload
  const result = deletedFileSchema.safeParse(payload);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid payload";
    log.warn(
      { event: "deleted-file", validationError: message },
      "Validation failed",
    );
    return callback(validationError(message));
  }

  try {
    const { path } = result.data;
    const storeId = socket.data.storeId;
    const room = getStoreRoom(storeId);

    log.info({ event: "deleted-file", path }, "Deleting file");

    // Delete the file (returns whether it was actually deleted)
    const { deleted } = await deleteFile(storeId, path);

    if (deleted) {
      log.info({ event: "deleted-file", path }, "File deleted successfully");

      // Broadcast to other clients in the store room
      socket.to(room).emit("file-deleted", {
        path,
        deletedAt: new Date().toISOString(),
      });

      log.debug(
        { event: "file-deleted", path, room },
        "Broadcast sent to room",
      );
    } else {
      log.info({ event: "deleted-file", path }, "File not found (ignored)");
    }

    // Send success response to caller
    callback({ success: true });
  } catch (error) {
    log.error(
      { err: error, event: "deleted-file", path: payload.path },
      "Failed to delete file",
    );
    callback(errorResponse("INTERNAL_ERROR", "Failed to delete file"));
  }
}

/**
 * Handle renamed-file event
 * Renames/moves a file, creates new file if source doesn't exist
 */
async function handleRenamedFile(
  socket: AuthenticatedSocket,
  _io: TypedServer,
  payload: RenamedFilePayload,
  callback: AckCallback,
): Promise<void> {
  const log = createSocketLogger(socket.id, socket.data.storeId);

  // Check write permission
  if (!hasPermission(socket, "write")) {
    log.warn(
      {
        event: "renamed-file",
        oldPath: payload.oldPath,
        newPath: payload.newPath,
      },
      "Permission denied: write required",
    );
    return callback(forbiddenResponse());
  }

  // Validate payload
  const result = renamedFileSchema.safeParse(payload);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid payload";
    log.warn(
      { event: "renamed-file", validationError: message },
      "Validation failed",
    );
    return callback(validationError(message));
  }

  try {
    const { oldPath, newPath } = result.data;
    const storeId = socket.data.storeId;
    const room = getStoreRoom(storeId);

    log.info({ event: "renamed-file", oldPath, newPath }, "Renaming file");

    // Rename the file (creates at newPath if oldPath doesn't exist)
    const file = await renameFile(storeId, oldPath, newPath);

    if (file.created) {
      log.info(
        { event: "renamed-file", oldPath, newPath },
        "Source not found, created new file at target path",
      );

      // Broadcast file-created since source didn't exist (with content)
      socket.to(room).emit("file-created", {
        path: file.path,
        content: file.content,
        hash: file.hash,
        size: file.size,
        createdAt: file.createdAt.toISOString(),
      });

      log.debug(
        { event: "file-created", path: newPath, room },
        "Broadcast sent to room",
      );
    } else {
      log.info(
        { event: "renamed-file", oldPath, newPath },
        "File renamed successfully",
      );

      // Broadcast to other clients in the store room (with content)
      socket.to(room).emit("file-renamed", {
        oldPath,
        newPath: file.path,
        content: file.content,
        hash: file.hash,
        size: file.size,
        updatedAt: file.updatedAt.toISOString(),
      });

      log.debug(
        { event: "file-renamed", oldPath, newPath, room },
        "Broadcast sent to room",
      );
    }

    // Send success response to caller
    callback({ success: true });
  } catch (error) {
    log.error(
      {
        err: error,
        event: "renamed-file",
        oldPath: payload.oldPath,
        newPath: payload.newPath,
      },
      "Failed to rename file",
    );
    callback(errorResponse("INTERNAL_ERROR", "Failed to rename file"));
  }
}

// ============================================
// Register Event Handlers
// ============================================

/**
 * Register all event handlers for a connected socket
 */
export function registerSocketHandlers(
  socket: AuthenticatedSocket,
  io: TypedServer,
): void {
  const storeId = socket.data.storeId;
  const log = createSocketLogger(socket.id, storeId);

  log.info(
    { permissions: socket.data.permissions },
    "Socket connected, registering event handlers",
  );

  socket.on("created-file", (payload, callback) => {
    handleCreatedFile(socket, io, payload, callback);
  });

  socket.on("modified-file", (payload, callback) => {
    handleModifiedFile(socket, io, payload, callback);
  });

  socket.on("deleted-file", (payload, callback) => {
    handleDeletedFile(socket, io, payload, callback);
  });

  socket.on("renamed-file", (payload, callback) => {
    handleRenamedFile(socket, io, payload, callback);
  });

  socket.on("disconnect", (reason) => {
    log.info({ reason }, "Socket disconnected");
  });

  socket.on("error", (error) => {
    log.error({ err: error }, "Socket error");
  });
}
