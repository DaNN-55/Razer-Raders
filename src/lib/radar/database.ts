import { Pool, type PoolClient } from "pg";

type DatabaseGlobal = typeof globalThis & {
  radarDatabasePool?: Pool;
};

const databaseGlobal = globalThis as DatabaseGlobal;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabasePool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL 未配置，无法读取 Radar Archive。");
  }

  if (!databaseGlobal.radarDatabasePool) {
    databaseGlobal.radarDatabasePool = new Pool({ connectionString, max: 8 });
  }

  return databaseGlobal.radarDatabasePool;
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getDatabasePool().connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
