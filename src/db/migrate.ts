import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDatabasePool } from "../lib/radar/database.ts";

async function migrate() {
  const migrationsDirectory = join(process.cwd(), "src/db/migrations");
  const migrations = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
  const database = getDatabasePool();

  await database.query("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");

  for (const migration of migrations) {
    const applied = await database.query("SELECT 1 FROM schema_migrations WHERE id = $1", [migration]);
    if (applied.rowCount) continue;

    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query(await readFile(join(migrationsDirectory, migration), "utf8"));
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migration]);
      await client.query("COMMIT");
      console.log(`已应用迁移：${migration}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  await database.end();
}

migrate().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
