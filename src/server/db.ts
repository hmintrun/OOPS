import "server-only";
import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import { requiredEnv } from "./config";

let pool: Pool | undefined;

function databasePool() {
  if (pool) return pool;
  const connectionString = requiredEnv("DATABASE_URL");
  const url = new URL(connectionString);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const caFile = process.env.DATABASE_CA_FILE;
  const caPem = process.env.DATABASE_CA_PEM;
  // pg's connection-string SSL parameters take precedence over the ssl object.
  for (const option of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(option);
  pool = new Pool({
    connectionString: url.toString(),
    ssl: local ? false : {
      rejectUnauthorized: true,
      ...(caPem ? { ca: caPem } : caFile ? { ca: readFileSync(caFile, "utf8") } : {}),
    },
    max: 5,
    connectionTimeoutMillis: 5_000,
  });
  pool.on("error", () => console.error("OOPS: idle PostgreSQL connection failed"));
  return pool;
}

export async function transaction<T>(run: (client: PoolClient) => Promise<T>, readOnly = false): Promise<T> {
  const client = await databasePool().connect();
  let broken = false;
  try {
    await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}

export async function closeDatabase() {
  const currentPool = pool;
  pool = undefined;
  await currentPool?.end();
}
