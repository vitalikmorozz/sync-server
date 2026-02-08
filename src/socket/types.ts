import type { Server, Socket } from "socket.io";
import type { Permission } from "../db/schema";

/**
 * Socket data stored after authentication
 */
export interface SocketData {
  storeId: string;
  permissions: Permission[];
  keyId: string;
}

/**
 * Typed Socket.io socket with custom data
 */
export type AuthenticatedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Typed Socket.io server
 */
export type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

// ============================================
// Client -> Server Event Payloads
// ============================================

export interface CreatedFilePayload {
  path: string;
}

export interface ModifiedFilePayload {
  path: string;
  content: string;
}

export interface DeletedFilePayload {
  path: string;
}

export interface RenamedFilePayload {
  oldPath: string;
  newPath: string;
}

// ============================================
// Acknowledgment Responses
// ============================================

export interface SuccessResponse {
  success: true;
  hash?: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type AckResponse = SuccessResponse | ErrorResponse;

export type AckCallback = (response: AckResponse) => void;

// ============================================
// Server -> Client Event Payloads
// ============================================

export interface FileCreatedEvent {
  path: string;
  hash: string;
  size: number;
  createdAt: string; // ISO timestamp
}

export interface FileModifiedEvent {
  path: string;
  hash: string;
  size: number;
  updatedAt: string; // ISO timestamp
}

export interface FileDeletedEvent {
  path: string;
  deletedAt: string; // ISO timestamp
}

export interface FileRenamedEvent {
  oldPath: string;
  newPath: string;
  updatedAt: string; // ISO timestamp
}

// ============================================
// Event Maps for Socket.io Typing
// ============================================

export interface ClientToServerEvents {
  "created-file": (payload: CreatedFilePayload, callback: AckCallback) => void;
  "modified-file": (
    payload: ModifiedFilePayload,
    callback: AckCallback,
  ) => void;
  "deleted-file": (payload: DeletedFilePayload, callback: AckCallback) => void;
  "renamed-file": (payload: RenamedFilePayload, callback: AckCallback) => void;
}

export interface ServerToClientEvents {
  "file-created": (event: FileCreatedEvent) => void;
  "file-modified": (event: FileModifiedEvent) => void;
  "file-deleted": (event: FileDeletedEvent) => void;
  "file-renamed": (event: FileRenamedEvent) => void;
}
