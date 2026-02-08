import crypto from "crypto";
import { eq, and, like, count, asc } from "drizzle-orm";
import { db, files, type File } from "../db";
import { ConflictError, NotFoundError } from "../errors";

export interface FileInfo {
  id: string;
  path: string;
  hash: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertResult extends FileInfo {
  created: boolean;
  content: string;
}

export interface DeleteResult {
  deleted: boolean;
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
  };
}

export function computeHash(content: string): string {
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return `sha256:${hash}`;
}

export async function listFiles(storeId: string): Promise<FileInfo[]> {
  const fileList = await db.query.files.findMany({
    where: eq(files.storeId, storeId),
    orderBy: files.path,
  });

  return fileList.map(toFileInfo);
}

export async function listFilesWithPagination(
  storeId: string,
  options: { pathPrefix?: string; limit: number; offset: number },
): Promise<PaginatedFiles> {
  const { pathPrefix, limit, offset } = options;

  const whereCondition = pathPrefix
    ? and(eq(files.storeId, storeId), like(files.path, `${pathPrefix}%`))
    : eq(files.storeId, storeId);

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

export async function getFile(
  storeId: string,
  path: string,
): Promise<File | null> {
  const file = await db.query.files.findFirst({
    where: and(eq(files.storeId, storeId), eq(files.path, path)),
  });

  return file ?? null;
}

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

export async function createFile(
  storeId: string,
  path: string,
): Promise<UpsertResult> {
  const existing = await getFile(storeId, path);
  if (existing) {
    return {
      ...toFileInfo(existing),
      content: existing.content,
      created: false,
    };
  }

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

export async function createFileStrict(
  storeId: string,
  data: { path: string; content: string },
): Promise<FileWithContent> {
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

export async function updateFile(
  storeId: string,
  path: string,
  content: string,
): Promise<UpsertResult> {
  const hash = computeHash(content);
  const size = Buffer.byteLength(content, "utf8");
  const now = new Date();

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

export async function deleteAllFiles(
  storeId: string,
): Promise<{ count: number }> {
  const result = await db
    .delete(files)
    .where(eq(files.storeId, storeId))
    .returning({ id: files.id });

  return { count: result.length };
}

export async function renameFile(
  storeId: string,
  oldPath: string,
  newPath: string,
): Promise<RenameResult> {
  const now = new Date();
  const existing = await getFile(storeId, oldPath);

  if (!existing) {
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

  await db
    .delete(files)
    .where(and(eq(files.storeId, storeId), eq(files.path, newPath)));

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
