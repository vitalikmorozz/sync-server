import crypto from "crypto";
import { eq, and, isNull, isNotNull, lt } from "drizzle-orm";
import { db, settings, type Setting } from "../db";
import { SETTINGS_TOMBSTONE_TTL_MS } from "../db/schema/settings";
import { NotFoundError } from "../errors";
import { getFileMetadata } from "../utils/binary";

// ============================================================================
// Types
// ============================================================================

export interface SettingInfo {
  id: string;
  path: string;
  hash: string;
  size: number;
  isBinary: boolean;
  extension: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

export interface SettingWithContent extends SettingInfo {
  content: string;
}

// ============================================================================
// Helpers
// ============================================================================

function toSettingInfo(record: Setting): SettingInfo {
  return {
    id: record.id,
    path: record.path,
    hash: record.hash,
    size: record.size,
    isBinary: record.isBinary,
    extension: record.extension,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
  };
}

function computeHash(content: string): string {
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return `sha256:${hash}`;
}

function computeExpiresAt(): Date {
  return new Date(Date.now() + SETTINGS_TOMBSTONE_TTL_MS);
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Delete expired tombstones (settings where expires_at has passed).
 * Called lazily during list operations — fire-and-forget.
 */
export async function cleanupExpiredSettings(): Promise<number> {
  const result = await db
    .delete(settings)
    .where(
      and(isNotNull(settings.expiresAt), lt(settings.expiresAt, new Date())),
    )
    .returning({ id: settings.id });

  return result.length;
}

/**
 * List all active settings in a store (metadata only, no content, no tombstones).
 */
export async function listSettings(storeId: string): Promise<SettingInfo[]> {
  // Fire-and-forget cleanup of expired tombstones
  cleanupExpiredSettings().catch(() => {});

  const settingList = await db.query.settings.findMany({
    where: and(eq(settings.storeId, storeId), isNull(settings.expiresAt)),
    orderBy: settings.path,
  });

  return settingList.map(toSettingInfo);
}

/**
 * Get a single active setting by path (tombstones are invisible).
 * Returns the setting with content, or null if not found/tombstoned.
 */
export async function getSetting(
  storeId: string,
  path: string,
): Promise<SettingWithContent | null> {
  const setting = await db.query.settings.findFirst({
    where: and(
      eq(settings.storeId, storeId),
      eq(settings.path, path),
      isNull(settings.expiresAt),
    ),
  });

  if (!setting) {
    return null;
  }

  return {
    ...toSettingInfo(setting),
    content: setting.content,
  };
}

/**
 * Get a single active setting with content, or throw NotFoundError.
 */
export async function getSettingOrThrow(
  storeId: string,
  path: string,
): Promise<SettingWithContent> {
  const setting = await getSetting(storeId, path);

  if (!setting) {
    throw new NotFoundError("Setting", path);
  }

  return setting;
}

/**
 * Find any setting record at the given path, including tombstones.
 */
async function findSettingIncludingTombstones(
  storeId: string,
  path: string,
): Promise<Setting | null> {
  const setting = await db.query.settings.findFirst({
    where: and(eq(settings.storeId, storeId), eq(settings.path, path)),
  });
  return setting ?? null;
}

/**
 * Upsert a setting: create or update, handling tombstone resurrection.
 * Computes hash/size/extension/isBinary from content and path.
 */
export async function upsertSetting(
  storeId: string,
  path: string,
  content: string,
): Promise<SettingWithContent> {
  const metadata = getFileMetadata(path);
  const hash = computeHash(content);
  const size = Buffer.byteLength(content, "utf8");
  const now = new Date();

  const existing = await findSettingIncludingTombstones(storeId, path);

  if (existing) {
    // Update existing record (active or tombstone — resurrect if tombstoned)
    const [record] = await db
      .update(settings)
      .set({
        content,
        hash,
        size,
        expiresAt: null,
        updatedAt: now,
        ...metadata,
      })
      .where(eq(settings.id, existing.id))
      .returning();

    return { ...toSettingInfo(record), content };
  }

  // No record — insert new
  const [record] = await db
    .insert(settings)
    .values({ storeId, path, content, hash, size, ...metadata })
    .returning();

  return { ...toSettingInfo(record), content };
}

/**
 * Soft-delete a setting: set expiresAt, keep content intact.
 * Returns true if an active setting was found and soft-deleted.
 */
export async function deleteSetting(
  storeId: string,
  path: string,
): Promise<boolean> {
  const expiresAt = computeExpiresAt();

  const result = await db
    .update(settings)
    .set({
      expiresAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(settings.storeId, storeId),
        eq(settings.path, path),
        isNull(settings.expiresAt),
      ),
    )
    .returning({ id: settings.id });

  return result.length > 0;
}

/**
 * Soft-delete all active settings in a store. Content is kept intact.
 * Returns the count of settings deleted.
 */
export async function deleteAllSettings(storeId: string): Promise<number> {
  const expiresAt = computeExpiresAt();

  const result = await db
    .update(settings)
    .set({
      expiresAt,
      updatedAt: new Date(),
    })
    .where(and(eq(settings.storeId, storeId), isNull(settings.expiresAt)))
    .returning({ id: settings.id });

  return result.length;
}
