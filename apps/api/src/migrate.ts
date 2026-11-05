import { runMigrations } from "@jobia/db";

/** One-shot entrypoint run before the API starts (see docker-compose.prod.yml). */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

await runMigrations(url, process.env.MIGRATIONS_DIR ?? "./drizzle");
console.log("migrations applied");
