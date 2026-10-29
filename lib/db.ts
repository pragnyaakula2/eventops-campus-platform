/**
 * EventOps PostgreSQL Connection Pool Singleton
 * Manages connection pooling for Next.js App Router (Node.js runtime).
 */
import pg from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

const { Pool } = pg;

declare global {
  var _pgPool: pg.Pool | undefined;
}

const connectionString =
  process.env.DATABASE_URL || 'postgresql://localhost:5432/eventops';

export const pool: pg.Pool =
  global._pgPool ||
  new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== 'production') {
  global._pgPool = pool;
}

/**
 * Executes a SQL query with parameter binding using the shared pool.
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

/**
 * Acquires a client from the pool for manual multi-statement transactions.
 * Remember to call client.release() when finished!
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

export default pool;
