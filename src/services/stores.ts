import { eq, sql } from "drizzle-orm";
import { db, stores, files, type Store, type NewStore } from "../db";
import { NotFoundError } from "../errors";

/**
 * Store with aggregated stats
 */
export interface StoreWithStats extends Store {
  fileCount: number;
  totalSize: number;
}

/**
 * List all stores with file stats
 */
export async function listStores(): Promise<StoreWithStats[]> {
  const result = await db
    .select({
      id: stores.id,
      name: stores.name,
      createdAt: stores.createdAt,
      updatedAt: stores.updatedAt,
      fileCount: sql<number>`COALESCE(COUNT(${files.id}), 0)::int`,
      totalSize: sql<number>`COALESCE(SUM(${files.size}), 0)::int`,
    })
    .from(stores)
    .leftJoin(files, eq(files.storeId, stores.id))
    .groupBy(stores.id)
    .orderBy(stores.createdAt);

  return result;
}

/**
 * Get a store by ID
 */
export async function getStore(storeId: string): Promise<Store> {
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
  });

  if (!store) {
    throw new NotFoundError("Store", storeId);
  }

  return store;
}

/**
 * Get a store by ID with stats
 */
export async function getStoreWithStats(
  storeId: string,
): Promise<StoreWithStats> {
  const result = await db
    .select({
      id: stores.id,
      name: stores.name,
      createdAt: stores.createdAt,
      updatedAt: stores.updatedAt,
      fileCount: sql<number>`COALESCE(COUNT(${files.id}), 0)::int`,
      totalSize: sql<number>`COALESCE(SUM(${files.size}), 0)::int`,
    })
    .from(stores)
    .leftJoin(files, eq(files.storeId, stores.id))
    .where(eq(stores.id, storeId))
    .groupBy(stores.id);

  if (result.length === 0) {
    throw new NotFoundError("Store", storeId);
  }

  return result[0];
}

/**
 * Create a new store
 */
export async function createStore(data: NewStore): Promise<Store> {
  const [store] = await db.insert(stores).values(data).returning();
  return store;
}

/**
 * Delete a store and all its files/keys (cascade)
 */
export async function deleteStore(storeId: string): Promise<void> {
  // First verify store exists
  await getStore(storeId);

  // Delete store (files and keys cascade automatically)
  await db.delete(stores).where(eq(stores.id, storeId));
}

/**
 * Update a store's name
 */
export async function updateStore(
  storeId: string,
  data: Partial<Pick<Store, "name">>,
): Promise<Store> {
  const [store] = await db
    .update(stores)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(stores.id, storeId))
    .returning();

  if (!store) {
    throw new NotFoundError("Store", storeId);
  }

  return store;
}
