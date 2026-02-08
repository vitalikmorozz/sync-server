import crypto from "crypto";
import { eq, and, like, count, asc } from "drizzle-orm";
import { db, files, type File } from "../db";
import { ConflictError, NotFoundError } from "../errors";

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
  content: string;
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
  content: string;
}

/**
 * File with content (for API responses)
 */
export interface FileWithContent extends FileInfo {
  content: string;
}

/**
 * Paginated list result
 */
export interface PaginatedFiles {
  files: FileInfo[];
  total: number;
  limit: number;
  offset: number;
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
 * List all files in a store (simple version for internal use)
 */
export async function listFiles(storeId: string): Promise<FileInfo[]> {
  const fileList = await db.query.files.findMany({
    where: eq(files.storeId, storeId),
    orderBy: files.path,
  });

  return fileList.map(toFileInfo);
}

/**
 * List files with pagination and optional path prefix filter
 */
export async function listFilesWithPagination(
  storeId: string,
  options: { pathPrefix?: string; limit: number; offset: number },
): Promise<PaginatedFiles> {
  const { pathPrefix, limit, offset } = options;

  // Build where condition
  const whereCondition = pathPrefix
    ? and(eq(files.storeId, storeId), like(files.path, `${pathPrefix}%`))
    : eq(files.storeId, storeId);

  // Get total count
  const [countResult] = await db
    .select({ count: count() })
    .from(files)
    .where(whereCondition);

  const total = countResult?.count ?? 0;

  // Get paginated files (without content for efficiency)
  const fileList = await db
    .select({
      id: files.id,
      path: files.path,
      hash: files.hash,
      size: files.size,
      createdAt: files.createdAt,
      updatedAt: files.updatedAt,
    })
    .from(files)
    .where(whereCondition)
    .orderBy(asc(files.path))
    .limit(limit)
    .offset(offset);

  return {
    files: fileList.map((f) => ({
      id: f.id,
      path: f.path,
      hash: f.hash,
      size: f.size,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
    total,
    limit,
    offset,
  };
}

/**
 * Get a file by path (internal use, returns full DB record)
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
 * Get a file with content (for API responses)
 * Throws NotFoundError if file doesn't exist
 */
export async function getFileWithContent(
  storeId: string,
  path: string,
): Promise<FileWithContent> {
  const file = await getFile(storeId, path);

  if (!file) {
    throw new NotFoundError("File", path);
  }

  return {
    id: file.id,
    path: file.path,
    content: file.content,
    hash: file.hash,
    size: file.size,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

/**
 * Create/discover a file (upsert with empty content by default)
 * If file already exists, returns existing file info
 * Used by WebSocket handlers for "discovery" mode
 */
export async function createFile(
  storeId: string,
  path: string,
): Promise<UpsertResult> {
  // Check if file already exists
  const existing = await getFile(storeId, path);
  if (existing) {
    return {
      ...toFileInfo(existing),
      content: existing.content,
      created: false,
    };
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

  return { ...toFileInfo(record), content, created: true };
}

/**
 * Create a new file with content (strict mode)
 * Throws ConflictError if file already exists
 * Used by REST API POST endpoint
 */
export async function createFileStrict(
  storeId: string,
  data: { path: string; content: string },
): Promise<FileWithContent> {
  // Check if file already exists
  const existing = await getFile(storeId, data.path);
  if (existing) {
    throw new ConflictError(`File already exists: ${data.path}`);
  }

  const hash = computeHash(data.content);
  const size = Buffer.byteLength(data.content, "utf8");

  const [record] = await db
    .insert(files)
    .values({
      storeId,
      path: data.path,
      content: data.content,
      hash,
      size,
    })
    .returning();

  return { ...toFileInfo(record), content: data.content };
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
    return { ...toFileInfo(result[0]), content, created: false };
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

  return { ...toFileInfo(record), content, created: true };
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
 * Delete all files in a store
 */
export async function deleteAllFiles(
  storeId: string,
): Promise<{ count: number }> {
  const result = await db
    .delete(files)
    .where(eq(files.storeId, storeId))
    .returning({ id: files.id });

  return { count: result.length };
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

    return { ...toFileInfo(record), content, created: true };
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

  return {
    ...toFileInfo(result[0]),
    content: existing.content,
    created: false,
  };
}
