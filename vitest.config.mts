import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    ...(process.env.OOPS_RUN_DB_TESTS === "1" && { testTimeout: 120_000 }),
  },
});
