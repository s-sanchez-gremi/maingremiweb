// End-to-end tests run against a REAL production build on port 3100 and a throwaway database (apex_e2e).
// Needs the local Docker services (Postgres + S3 mock) running: `docker compose up -d`.
import { defineConfig } from "@playwright/test";

export const PORT = 3100;
export const E2E_DB = "postgres://apex:apex@localhost:5432/apex_e2e";
export const CRON_SECRET = "e2e-cron-secret-value";

// Every test starts as a visitor who already answered the cookie banner ("reject all"), so the banner does not cover
// other tests' buttons. The consent tests clear this on purpose.
const rejected = encodeURIComponent(JSON.stringify({ v: 1, t: new Date().toISOString(), attribution: false, embeds: false }));
export const REJECTED_STATE = { cookies: [{ name: "apex_consent", value: rejected, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 86400, httpOnly: false, secure: false, sameSite: "Lax" as const }], origins: [] };

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", storageState: REJECTED_STATE },
  webServer: {
    command: `rm -rf .next-e2e && pnpm exec next build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/robots.txt`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: { NEXT_DIST_DIR: ".next-e2e", DATABASE_URL: E2E_DB, SITE_URL: `http://localhost:${PORT}`, CRON_SECRET, APP_ENV: "e2e" },
  },
});
