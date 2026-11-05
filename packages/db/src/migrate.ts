import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/**
 * Applies pending SQL migrations (drizzle/*.sql). Safe to run on every
 * deploy: already-applied migrations are tracked in `drizzle.__drizzle_migrations`
 * and the run is serialised with a Postgres advisory lock.
 */
export async function runMigrations(url: string, migrationsFolder: string): Promise<void> {
  const client = new pg.Client({ connectionString: url, application_name: "jobia-migrate" });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock(727274)");
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.query("select pg_advisory_unlock(727274)").catch(() => {});
    await client.end();
  }
}
