import crypto from "crypto";
import { eq, and, like, count, asc, isNull, isNotNull, lt } from "drizzle-orm";
import { db, files, type File } from "../db";
import { TOMBSTONE_TTL_MS } from "../db/schema/files";
import { ConflictError, NotFoundError } from "../errors";

// ============================================================================
// Types
// ============================================================================

export interface FileInfo {
  id: string;
  path: string;
  hash: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

export interface UpsertResult extends FileInfo {
  created: boolean;
  content: string;
}

export interface DeleteResult {
  deleted: boolean;
  expiresAt: Date | null;
}

export interface RenameResult extends FileInfo {
  created: boolean;
  content: string;
}

export interface FileWithContent extends FileInfo {
  content: string;
}

export interface PaginatedFiles {
  files: FileInfo[];
  total: number;
  limit: number;
  offset: number;
}

function toFileInfo(record: File): FileInfo {
  return {
    id: record.id,
    path: record.path,
    hash: record.hash,
    size: record.size,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
  };
}

export function computeHash(content: string): string {
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return `sha256:${hash}`;
}

function computeExpiresAt(): Date {
  return new Date(Date.now() + TOMBSTONE_TTL_MS);
}

/**
 * Delete expired tombstones (files where expires_at has passed).
 * Called lazily during list operations — fire-and-forget.
 */
export async function cleanupExpiredFiles(): Promise<number> {
  const result = await db
    .delete(files)
    .where(and(isNotNull(files.expiresAt), lt(files.expiresAt, new Date())))
    .returning({ id: files.id });

  return result.length;
}

/**
 * List all active files in a store (no content, no tombstones).
 */
export async function listFiles(storeId: string): Promise<FileInfo[]> {
  // Fire-and-forget cleanup of expired tombstones
  cleanupExpiredFiles().catch(() => {});

  const fileList = await db.query.files.findMany({
    where: and(eq(files.storeId, storeId), isNull(files.expiresAt)),
    orderBy: files.path,
  });

  return fileList.map(toFileInfo);
}

/**
 * List files with pagination. Optionally include soft-deleted tombstones.
 */
export async function listFilesWithPagination(
  storeId: string,
  options: {
    pathPrefix?: string;
    limit: number;
    offset: number;
    includeDeleted?: boolean;
  },
): Promise<PaginatedFiles> {
  const { pathPrefix, limit, offset, includeDeleted = false } = options;

  // Fire-and-forget cleanup of expired tombstones
  cleanupExpiredFiles().catch(() => {});

  // Build where condition
  const conditions = [eq(files.storeId, storeId)];

  if (pathPrefix) {
    conditions.push(like(files.path, `${pathPrefix}%`));
  }

  if (!includeDeleted) {
    conditions.push(isNull(files.expiresAt));
  }

  const whereCondition = and(...conditions);

  const [countResult] = await db
    .select({ count: count() })
    .from(files)
    .where(whereCondition);

  const total = countResult?.count ?? 0;

  const fileList = await db
    .select({
      id: files.id,
      path: files.path,
      hash: files.hash,
      size: files.size,
      createdAt: files.createdAt,
      updatedAt: files.updatedAt,
      expiresAt: files.expiresAt,
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
      expiresAt: f.expiresAt,
    })),
    total,
    limit,
    offset,
  };
}

/**
 * Get a single active file by path (tombstones are invisible).
 */
export async function getFile(
  storeId: string,
  path: string,
): Promise<File | null> {
  const file = await db.query.files.findFirst({
    where: and(
      eq(files.storeId, storeId),
      eq(files.path, path),
      isNull(files.expiresAt),
    ),
  });

  return file ?? null;
}

/**
 * Get a single active file with content, or throw NotFoundError.
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
    expiresAt: file.expiresAt,
  };
}

/**
 * Find any file record at the given path, including tombstones.
 */
async function findFileIncludingTombstones(
  storeId: string,
  path: string,
): Promise<File | null> {
  const file = await db.query.files.findFirst({
    where: and(eq(files.storeId, storeId), eq(files.path, path)),
  });
  return file ?? null;
}

/**
 * Resurrect a tombstone: clear expiresAt, set new content.
 */
async function resurrectFile(fileId: string, content: string): Promise<File> {
  const hash = computeHash(content);
  const size = Buffer.byteLength(content, "utf8");
  const now = new Date();

  const [record] = await db
    .update(files)
    .set({
      content,
      hash,
      size,
      expiresAt: null,
      updatedAt: now,
    })
    .where(eq(files.id, fileId))
    .returning();

  return record;
}

/**
 * Create an empty file (used by socket "created-file" event).
 * If an active file exists at the path, returns it with created=false.
 * If a tombstone exists, resurrects it.
 */
export async function createFile(
  storeId: string,
  path: string,
): Promise<UpsertResult> {
  const existing = await findFileIncludingTombstones(storeId, path);

  if (existing) {
    // Active file exists — return it
    if (!existing.expiresAt) {
      return {
        ...toFileInfo(existing),
        content: existing.content,
        created: false,
      };
    }

    // Tombstone — resurrect with empty content
    const record = await resurrectFile(existing.id, "");
    return { ...toFileInfo(record), content: "", created: true };
  }

  // No record at all — insert new
  const content = "";
  const hash = computeHash(content);
  const size = 0;

  const [record] = await db
    .insert(files)
    .values({ storeId, path, content, hash, size })
    .returning();

  return { ...toFileInfo(record), content, created: true };
}

/**
 * Strict create with content (used by HTTP POST).
 * Throws ConflictError if an active file exists.
 * Resurrects tombstones.
 */
export async function createFileStrict(
  storeId: string,
  data: { path: string; content: string },
): Promise<FileWithContent> {
  const existing = await findFileIncludingTombstones(storeId, data.path);

  if (existing) {
    // Active file — conflict
    if (!existing.expiresAt) {
      throw new ConflictError(`File already exists: ${data.path}`);
    }

    // Tombstone — resurrect with provided content
    const record = await resurrectFile(existing.id, data.content);
    return { ...toFileInfo(record), content: data.content };
  }

  // No record — insert new
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
 * Update file content (upsert). Used by socket "modified-file" and HTTP PUT.
 * If an active file exists, updates it.
 * If a tombstone exists, resurrects it.
 * If no record exists, creates a new one.
 */
export async function updateFile(
  storeId: string,
  path: string,
  content: string,
): Promise<UpsertResult> {
  const hash = computeHash(content);
  const size = Buffer.byteLength(content, "utf8");
  const now = new Date();

  const existing = await findFileIncludingTombstones(storeId, path);

  if (existing) {
    // Active file — update content
    if (!existing.expiresAt) {
      const [record] = await db
        .update(files)
        .set({ content, hash, size, updatedAt: now })
        .where(eq(files.id, existing.id))
        .returning();

      return { ...toFileInfo(record), content, created: false };
    }

    // Tombstone — resurrect with provided content
    const record = await resurrectFile(existing.id, content);
    return { ...toFileInfo(record), content, created: true };
  }

  // No record — insert new
  const [record] = await db
    .insert(files)
    .values({ storeId, path, content, hash, size })
    .returning();

  return { ...toFileInfo(record), content, created: true };
}

/**
 * Soft-delete a file: set expiresAt and clear content.
 * Returns deleted=true if an active file was found and soft-deleted.
 */
export async function deleteFile(
  storeId: string,
  path: string,
): Promise<DeleteResult> {
  const expiresAt = computeExpiresAt();
  const emptyHash = computeHash("");

  const result = await db
    .update(files)
    .set({
      content: "",
      hash: emptyHash,
      size: 0,
      expiresAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(files.storeId, storeId),
        eq(files.path, path),
        isNull(files.expiresAt),
      ),
    )
    .returning({ id: files.id });

  return {
    deleted: result.length > 0,
    expiresAt: result.length > 0 ? expiresAt : null,
  };
}

/**
 * Soft-delete all active files in a store.
 */
export async function deleteAllFiles(
  storeId: string,
): Promise<{ count: number }> {
  const expiresAt = computeExpiresAt();
  const emptyHash = computeHash("");

  const result = await db
    .update(files)
    .set({
      content: "",
      hash: emptyHash,
      size: 0,
      expiresAt,
      updatedAt: new Date(),
    })
    .where(and(eq(files.storeId, storeId), isNull(files.expiresAt)))
    .returning({ id: files.id });

  return { count: result.length };
}

/**
 * Rename a file from oldPath to newPath.
 * - If an active file exists at newPath, it is soft-deleted first.
 * - If source is a tombstone or doesn't exist, creates empty file at newPath.
 */
export async function renameFile(
  storeId: string,
  oldPath: string,
  newPath: string,
): Promise<RenameResult> {
  const now = new Date();

  // Get source file (active only)
  const existing = await getFile(storeId, oldPath);

  if (!existing) {
    // Source doesn't exist (or is a tombstone) — soft-delete anything at newPath, create empty
    await softDeleteAtPath(storeId, newPath);

    // Check if there's a tombstone at newPath we can resurrect
    const tombstone = await findFileIncludingTombstones(storeId, newPath);
    if (tombstone && tombstone.expiresAt) {
      const record = await resurrectFile(tombstone.id, "");
      return { ...toFileInfo(record), content: "", created: true };
    }

    const content = "";
    const hash = computeHash(content);

    const [record] = await db
      .insert(files)
      .values({ storeId, path: newPath, content, hash, size: 0 })
      .returning();

    return { ...toFileInfo(record), content, created: true };
  }

  // Soft-delete anything active at newPath
  await softDeleteAtPath(storeId, newPath);

  // Hard-delete any tombstone at newPath to avoid unique constraint violation
  await db
    .delete(files)
    .where(
      and(
        eq(files.storeId, storeId),
        eq(files.path, newPath),
        isNotNull(files.expiresAt),
      ),
    );

  // Rename source file
  const result = await db
    .update(files)
    .set({ path: newPath, updatedAt: now })
    .where(
      and(
        eq(files.storeId, storeId),
        eq(files.path, oldPath),
        isNull(files.expiresAt),
      ),
    )
    .returning();

  // Soft-delete the old path (create a tombstone so clients know oldPath was removed)
  // We don't need this because rename broadcasts handle the oldPath on connected clients,
  // and offline clients will see the file missing at oldPath + present at newPath.

  return {
    ...toFileInfo(result[0]),
    content: existing.content,
    created: false,
  };
}

/**
 * Soft-delete any active file at the given path (used internally by rename).
 */
async function softDeleteAtPath(storeId: string, path: string): Promise<void> {
  const expiresAt = computeExpiresAt();
  const emptyHash = computeHash("");

  await db
    .update(files)
    .set({
      content: "",
      hash: emptyHash,
      size: 0,
      expiresAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(files.storeId, storeId),
        eq(files.path, path),
        isNull(files.expiresAt),
      ),
    );
}
