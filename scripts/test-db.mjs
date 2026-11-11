import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkDatabase, env, loopback } from "./dev-environment.mjs";

try {
  const database = env("OOPS_TEST_DATABASE_URL");
  const url = checkDatabase(database, true);
  if (!loopback.includes(url.hostname)) env("SUPABASE_SECRET_KEY");
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url)),
    "run", "tests/foundation.db.test.ts",
  ], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: database,
      OOPS_RUN_DB_TESTS: "1",
      APP_URL: "http://localhost:3000",
      OOPS_INVITE_SECRET: "test-only-invite-key-do-not-use-in-app",
    },
  });
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error("Không chạy được test PostgreSQL:", error.message);
  process.exitCode = 1;
}
