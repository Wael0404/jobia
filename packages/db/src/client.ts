import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseOptions {
  url: string;
  /**
   * Keep pools small per process: with N API replicas behind PgBouncer
   * (transaction mode) the total stays bounded. See docs/ARCHITECTURE.md.
   */
  maxConnections?: number;
  applicationName: string;
}

export function createDatabase(options: DatabaseOptions): { db: Database; close: () => Promise<void> } {
  const pool = new pg.Pool({
    connectionString: options.url,
    max: options.maxConnections ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: options.applicationName,
  });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}
