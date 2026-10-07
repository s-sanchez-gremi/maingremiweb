import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, ".") } },
  test: { exclude: ["e2e/**", "node_modules/**", ".next/**"], fileParallelism: false },
});
