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

const pathSchema = z
  .string()
  .min(1, "Path is required")
  .max(1000, "Path too long")
  .regex(/^[^<>:"|?*\x00-\x1f]+$/, "Invalid path characters");

const contentSchema = z
  .string()
  .max(10 * 1024 * 1024, "Content too large (max 10MB)");

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

async function handleCreatedFile(
  socket: AuthenticatedSocket,
  _io: TypedServer,
  payload: CreatedFilePayload,
  callback: AckCallback,
): Promise<void> {
  const log = createSocketLogger(socket.id, socket.data.storeId);

  if (!hasPermission(socket, "write")) {
    log.warn(
      { event: "created-file", path: payload.path },
      "Permission denied",
    );
    return callback(forbiddenResponse());
  }

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

    log.info({ event: "created-file", path }, "Creating file");

    const file = await createFile(storeId, path);

    if (file.created) {
      log.info(
        { event: "created-file", path, hash: file.hash },
        "File created",
      );

      socket.to(room).emit("file-created", {
        path: file.path,
        content: file.content,
        hash: file.hash,
        size: file.size,
        createdAt: file.createdAt.toISOString(),
      });

      log.debug({ event: "file-created", path, room }, "Broadcast sent");
    } else {
      log.info(
        { event: "created-file", path, hash: file.hash },
        "File already exists",
      );
    }

    callback({ success: true, hash: file.hash });
  } catch (error) {
    log.error(
      { err: error, event: "created-file", path: payload.path },
      "Failed to create file",
    );
    callback(errorResponse("INTERNAL_ERROR", "Failed to create file"));
  }
}

async function handleModifiedFile(
  socket: AuthenticatedSocket,
  _io: TypedServer,
  payload: ModifiedFilePayload,
  callback: AckCallback,
): Promise<void> {
  const log = createSocketLogger(socket.id, socket.data.storeId);

  if (!hasPermission(socket, "write")) {
    log.warn(
      { event: "modified-file", path: payload.path },
      "Permission denied",
    );
    return callback(forbiddenResponse());
  }

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

    const file = await updateFile(storeId, path, content);

    if (file.created) {
      log.info(
        { event: "modified-file", path, hash: file.hash, size: file.size },
        "File created",
      );

      socket.to(room).emit("file-created", {
        path: file.path,
        content: file.content,
        hash: file.hash,
        size: file.size,
        createdAt: file.createdAt.toISOString(),
      });

      log.debug({ event: "file-created", path, room }, "Broadcast sent");
    } else {
      log.info(
        { event: "modified-file", path, hash: file.hash, size: file.size },
        "File modified",
      );

      socket.to(room).emit("file-modified", {
        path: file.path,
        content: file.content,
        hash: file.hash,
        size: file.size,
        updatedAt: file.updatedAt.toISOString(),
      });

      log.debug({ event: "file-modified", path, room }, "Broadcast sent");
    }

    callback({ success: true, hash: file.hash });
  } catch (error) {
    log.error(
      { err: error, event: "modified-file", path: payload.path },
      "Failed to modify file",
    );
    callback(errorResponse("INTERNAL_ERROR", "Failed to modify file"));
  }
}

async function handleDeletedFile(
  socket: AuthenticatedSocket,
  _io: TypedServer,
  payload: DeletedFilePayload,
  callback: AckCallback,
): Promise<void> {
  const log = createSocketLogger(socket.id, socket.data.storeId);

  if (!hasPermission(socket, "write")) {
    log.warn(
      { event: "deleted-file", path: payload.path },
      "Permission denied",
    );
    return callback(forbiddenResponse());
  }

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

    const { deleted } = await deleteFile(storeId, path);

    if (deleted) {
      log.info({ event: "deleted-file", path }, "File deleted");

      socket.to(room).emit("file-deleted", {
        path,
        deletedAt: new Date().toISOString(),
      });

      log.debug({ event: "file-deleted", path, room }, "Broadcast sent");
    } else {
      log.info({ event: "deleted-file", path }, "File not found");
    }

    callback({ success: true });
  } catch (error) {
    log.error(
      { err: error, event: "deleted-file", path: payload.path },
      "Failed to delete file",
    );
    callback(errorResponse("INTERNAL_ERROR", "Failed to delete file"));
  }
}

async function handleRenamedFile(
  socket: AuthenticatedSocket,
  _io: TypedServer,
  payload: RenamedFilePayload,
  callback: AckCallback,
): Promise<void> {
  const log = createSocketLogger(socket.id, socket.data.storeId);

  if (!hasPermission(socket, "write")) {
    log.warn(
      {
        event: "renamed-file",
        oldPath: payload.oldPath,
        newPath: payload.newPath,
      },
      "Permission denied",
    );
    return callback(forbiddenResponse());
  }

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

    const file = await renameFile(storeId, oldPath, newPath);

    if (file.created) {
      log.info(
        { event: "renamed-file", oldPath, newPath },
        "Source not found, created at target",
      );

      socket.to(room).emit("file-created", {
        path: file.path,
        content: file.content,
        hash: file.hash,
        size: file.size,
        createdAt: file.createdAt.toISOString(),
      });

      log.debug(
        { event: "file-created", path: newPath, room },
        "Broadcast sent",
      );
    } else {
      log.info({ event: "renamed-file", oldPath, newPath }, "File renamed");

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
        "Broadcast sent",
      );
    }

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

export function registerSocketHandlers(
  socket: AuthenticatedSocket,
  io: TypedServer,
): void {
  const storeId = socket.data.storeId;
  const log = createSocketLogger(socket.id, storeId);

  log.info({ permissions: socket.data.permissions }, "Socket connected");

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
