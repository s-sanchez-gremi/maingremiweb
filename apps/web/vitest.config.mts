import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, ".") } },
  test: {
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    globalSetup: ["./test/global-setup.ts"],
    env: {
      DATABASE_URL: "postgres://apex:apex@localhost:5432/apex_test",
      S3_ENDPOINT: "http://localhost:9090", S3_BUCKET: "apex-media", S3_ACCESS_KEY: "x", S3_SECRET_KEY: "x",
      S3_PUBLIC_URL: "http://localhost:9090/apex-media", CRON_SECRET: "test-secret-value", BOT_SECRET: "test-bot-secret", S3_PRIVATE_BUCKET: "apex-private",
    },
    fileParallelism: false,
  },
});
