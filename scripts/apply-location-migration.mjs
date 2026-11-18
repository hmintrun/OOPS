import { readFileSync } from "node:fs";
import { env, devProjectUrl, postgresClient } from "./dev-environment.mjs";

// Explicitly scoped to the configured dev project; additive migration only.
devProjectUrl();
const db = postgresClient(env("DATABASE_URL"));
try {
  await db.connect();
  await db.query("BEGIN");
  await db.query("select pg_advisory_xact_lock(20261117, 1)");
  const { rows: [row] } = await db.query("select to_regclass('public.administrative_wards') as existing");
  if (!row.existing) {
    await db.query(readFileSync(new URL("../supabase/migrations/20261117000100_account_and_demand_locations.sql", import.meta.url), "utf8"));
  }
  await db.query(readFileSync(new URL("../supabase/migrations/20261117000200_representative_demand_location.sql", import.meta.url), "utf8"));
  await db.query("COMMIT");
  console.log("Applied additive location migration to verified dev project.");
} catch (error) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(error.message); process.exitCode = 1;
} finally { await db.end(); }
