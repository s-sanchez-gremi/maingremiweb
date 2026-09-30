import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, ".") } },
  test: {
    globalSetup: ["./test/global-setup.ts"],
    env: { DATABASE_URL: "postgres://apex:apex@localhost:5432/apex_test" },
    fileParallelism: false,
  },
});
