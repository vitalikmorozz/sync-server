import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Re-export schema for convenience
export * from "./schema";

/**
 * PostgreSQL connection pool
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Connection pool settings for small-scale deployment
  max: 10, // Maximum number of connections
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 5000, // Timeout for acquiring a connection
});

/**
 * Drizzle ORM instance with schema
 */
export const db = drizzle(pool, { schema });

/**
 * Test database connection
 * @returns true if connection successful, throws error otherwise
 */
export async function testConnection(): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    return true;
  } finally {
    client.release();
  }
}

/**
 * Close database connection pool
 * Call this when shutting down the server
 */
export async function closeConnection(): Promise<void> {
  await pool.end();
}

/**
 * Get the underlying connection pool
 * Useful for running raw queries or transactions
 */
export function getPool(): Pool {
  return pool;
}
