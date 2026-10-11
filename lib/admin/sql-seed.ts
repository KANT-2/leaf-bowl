import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

/** The SQL file owns BEGIN/COMMIT so the same file also works directly in psql. */
export async function applyDefaultSql(connectionString: string, filename = path.resolve(process.cwd(), "db/seed.sql")) {
  const sql = await readFile(filename, "utf8");
  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000, statement_timeout: 20_000 });
  try {
    await client.connect();
    await client.query(sql);
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* connection may already be closed */ }
    throw error;
  } finally { await client.end(); }
}
