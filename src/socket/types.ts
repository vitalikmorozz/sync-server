import type { Server, Socket } from "socket.io";
import type { Permission } from "../db/schema";

export interface SocketData {
  storeId: string;
  permissions: Permission[];
  keyId: string;
}

export type AuthenticatedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

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

export interface FileCreatedEvent {
  path: string;
  content: string;
  hash: string;
  size: number;
  isBinary: boolean;
  extension: string | null;
  createdAt: string; // ISO timestamp
}

export interface FileModifiedEvent {
  path: string;
  content: string;
  hash: string;
  size: number;
  isBinary: boolean;
  extension: string | null;
  updatedAt: string; // ISO timestamp
}

export interface FileDeletedEvent {
  path: string;
  deletedAt: string; // ISO timestamp
}

export interface FileRenamedEvent {
  oldPath: string;
  newPath: string;
  content: string;
  hash: string;
  size: number;
  isBinary: boolean;
  extension: string | null;
  updatedAt: string; // ISO timestamp
}

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
