import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db, files, type File } from "../db";

/**
 * File info returned from operations
 */
export interface FileInfo {
  id: string;
  path: string;
  hash: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Result of an upsert operation
 */
export interface UpsertResult extends FileInfo {
  created: boolean;
}

/**
 * Result of a delete operation
 */
export interface DeleteResult {
  deleted: boolean;
}

/**
 * Result of a rename operation
 */
export interface RenameResult extends FileInfo {
  created: boolean;
}

/**
 * Convert DB record to FileInfo
 */
function toFileInfo(record: File): FileInfo {
  return {
    id: record.id,
    path: record.path,
    hash: record.hash,
    size: record.size,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Compute SHA-256 hash of content
 */
export function computeHash(content: string): string {
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return `sha256:${hash}`;
}

/**
 * List all files in a store
 */
export async function listFiles(storeId: string): Promise<FileInfo[]> {
  const fileList = await db.query.files.findMany({
    where: eq(files.storeId, storeId),
    orderBy: files.path,
  });

  return fileList.map(toFileInfo);
}

/**
 * Get a file by path
 */
export async function getFile(
  storeId: string,
  path: string,
): Promise<File | null> {
  const file = await db.query.files.findFirst({
    where: and(eq(files.storeId, storeId), eq(files.path, path)),
  });

  return file ?? null;
}

/**
 * Create/discover a file (upsert with empty content by default)
 * If file already exists, returns existing file info
 */
export async function createFile(
  storeId: string,
  path: string,
): Promise<UpsertResult> {
  // Check if file already exists
  const existing = await getFile(storeId, path);
  if (existing) {
    return { ...toFileInfo(existing), created: false };
  }

  // Create with empty content
  const content = "";
  const hash = computeHash(content);
  const size = 0;

  const [record] = await db
    .insert(files)
    .values({
      storeId,
      path,
      content,
      hash,
      size,
    })
    .returning();

  return { ...toFileInfo(record), created: true };
}

/**
 * Update (modify) a file's content, or create it if it doesn't exist
 */
export async function updateFile(
  storeId: string,
  path: string,
  content: string,
): Promise<UpsertResult> {
  const hash = computeHash(content);
  const size = Buffer.byteLength(content, "utf8");
  const now = new Date();

  // Try to update first
  const result = await db
    .update(files)
    .set({
      content,
      hash,
      size,
      updatedAt: now,
    })
    .where(and(eq(files.storeId, storeId), eq(files.path, path)))
    .returning();

  if (result.length > 0) {
    return { ...toFileInfo(result[0]), created: false };
  }

  // File doesn't exist, create it
  const [record] = await db
    .insert(files)
    .values({
      storeId,
      path,
      content,
      hash,
      size,
    })
    .returning();

  return { ...toFileInfo(record), created: true };
}

/**
 * Delete a file (ignores if file doesn't exist)
 */
export async function deleteFile(
  storeId: string,
  path: string,
): Promise<DeleteResult> {
  const result = await db
    .delete(files)
    .where(and(eq(files.storeId, storeId), eq(files.path, path)))
    .returning({ id: files.id });

  return { deleted: result.length > 0 };
}

/**
 * Rename/move a file
 * If oldPath doesn't exist, creates a new empty file at newPath
 * If newPath already exists, deletes it first (overwrite)
 */
export async function renameFile(
  storeId: string,
  oldPath: string,
  newPath: string,
): Promise<RenameResult> {
  const now = new Date();

  // Check if old path exists
  const existing = await getFile(storeId, oldPath);

  if (!existing) {
    // Old file doesn't exist, create new empty file at newPath
    // First delete any existing file at newPath
    await db
      .delete(files)
      .where(and(eq(files.storeId, storeId), eq(files.path, newPath)));

    const content = "";
    const hash = computeHash(content);

    const [record] = await db
      .insert(files)
      .values({
        storeId,
        path: newPath,
        content,
        hash,
        size: 0,
      })
      .returning();

    return { ...toFileInfo(record), created: true };
  }

  // Delete any existing file at newPath (overwrite)
  await db
    .delete(files)
    .where(and(eq(files.storeId, storeId), eq(files.path, newPath)));

  // Rename the existing file
  const result = await db
    .update(files)
    .set({
      path: newPath,
      updatedAt: now,
    })
    .where(and(eq(files.storeId, storeId), eq(files.path, oldPath)))
    .returning();

  return { ...toFileInfo(result[0]), created: false };
}
