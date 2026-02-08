import crypto from "crypto";

/**
 * Generate a new API key for a store
 * Format: sk_store_{storeIdPrefix}_{randomSecret}
 */
export function generateApiKey(storeId: string): {
  key: string;
  hash: string;
  prefix: string;
} {
  // Extract first 6 chars of store UUID (without dashes)
  const storePrefix = storeId.replace(/-/g, "").substring(0, 6);

  // Generate 24 random bytes, encode as base64url (32 chars)
  const secret = crypto.randomBytes(24).toString("base64url");

  // Full key format
  const key = `sk_store_${storePrefix}_${secret}`;

  // SHA-256 hash for storage
  const hash = hashApiKey(key);

  // Prefix for identification in UI (first 16 chars)
  const prefix = key.substring(0, 16);

  return { key, hash, prefix };
}

/**
 * Generate a master admin API key
 * Format: sk_admin_{randomSecret}
 */
export function generateAdminKey(): string {
  const secret = crypto.randomBytes(24).toString("base64url");
  return `sk_admin_${secret}`;
}

/**
 * Hash an API key using SHA-256
 */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Check if a key is an admin key (starts with sk_admin_)
 */
export function isAdminKey(key: string): boolean {
  return key.startsWith("sk_admin_");
}

/**
 * Check if a key is a store key (starts with sk_store_)
 */
export function isStoreKey(key: string): boolean {
  return key.startsWith("sk_store_");
}
