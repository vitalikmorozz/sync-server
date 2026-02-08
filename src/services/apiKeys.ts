import { eq, and, isNull } from "drizzle-orm";
import { db, apiKeys, type ApiKey, type Permission } from "../db";
import { generateApiKey } from "../utils/apiKey";
import { NotFoundError } from "../errors";
import { getStore } from "./stores";

/**
 * API key response (without sensitive data)
 */
export interface ApiKeyInfo {
  id: string;
  name: string;
  permissions: Permission[];
  createdAt: Date;
  lastUsedAt: Date | null;
  prefix: string;
}

/**
 * API key creation response (includes the full key, shown only once)
 */
export interface ApiKeyCreated extends ApiKeyInfo {
  key: string;
}

/**
 * Convert DB record to API response
 */
function toApiKeyInfo(record: ApiKey): ApiKeyInfo {
  return {
    id: record.id,
    name: record.name,
    permissions: record.permissions as Permission[],
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    prefix: record.keyPrefix,
  };
}

/**
 * List all API keys for a store
 */
export async function listApiKeys(storeId: string): Promise<ApiKeyInfo[]> {
  // Verify store exists
  await getStore(storeId);

  const keys = await db.query.apiKeys.findMany({
    where: and(eq(apiKeys.storeId, storeId), isNull(apiKeys.revokedAt)),
    orderBy: apiKeys.createdAt,
  });

  return keys.map(toApiKeyInfo);
}

/**
 * Get a single API key by ID
 */
export async function getApiKey(
  storeId: string,
  keyId: string,
): Promise<ApiKeyInfo> {
  const key = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.id, keyId),
      eq(apiKeys.storeId, storeId),
      isNull(apiKeys.revokedAt),
    ),
  });

  if (!key) {
    throw new NotFoundError("API key", keyId);
  }

  return toApiKeyInfo(key);
}

/**
 * Create a new API key for a store
 * Returns the full key (only shown once)
 */
export async function createApiKey(
  storeId: string,
  data: { name: string; permissions: Permission[] },
): Promise<ApiKeyCreated> {
  // Verify store exists
  await getStore(storeId);

  // Generate the key
  const { key, hash, prefix } = generateApiKey(storeId);

  // Insert into database
  const [record] = await db
    .insert(apiKeys)
    .values({
      storeId,
      name: data.name,
      keyHash: hash,
      keyPrefix: prefix,
      permissions: data.permissions,
    })
    .returning();

  return {
    id: record.id,
    name: record.name,
    key, // Only returned on creation
    permissions: record.permissions as Permission[],
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    prefix: record.keyPrefix,
  };
}

/**
 * Revoke an API key (soft delete)
 */
export async function revokeApiKey(
  storeId: string,
  keyId: string,
): Promise<void> {
  const result = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, keyId),
        eq(apiKeys.storeId, storeId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id });

  if (result.length === 0) {
    throw new NotFoundError("API key", keyId);
  }
}

/**
 * Permanently delete an API key
 */
export async function deleteApiKey(
  storeId: string,
  keyId: string,
): Promise<void> {
  const result = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.storeId, storeId)))
    .returning({ id: apiKeys.id });

  if (result.length === 0) {
    throw new NotFoundError("API key", keyId);
  }
}
