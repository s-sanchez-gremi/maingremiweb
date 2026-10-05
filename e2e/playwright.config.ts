// End-to-end tests: every app as a REAL production build (web on 3100, CRM on 3101, admin on 3103) on one throwaway database (apex_e2e).
// Needs the local Docker services (Postgres + S3 mock + Mailpit): `docker compose up -d`.
// Specs live with their app: apps/web/e2e (public site), apps/admin/e2e (CMS) and apps/crm/e2e (CRM, forms, projects, ERP, portal).
import { defineConfig } from "@playwright/test";
import { ADMIN_PORT, ADMIN_URL, CRM_PORT, CRM_URL, CRON_SECRET, E2E_ADMIN_DB, E2E_CRM_DB, E2E_WEB_DB, REJECTED_STATE, WEB_PORT, WEB_URL } from "./constants";

// scripts/ci.sh builds the apps one after the other BEFORE the tests (E2E_PREBUILT=1): two builds at once starve a small CI runner.
const prebuilt = !!process.env.E2E_PREBUILT;
const build = prebuilt ? "" : "rm -rf .next-e2e .next/types .next/dev/types && pnpm exec next build && ";

const base = { CRON_SECRET, APP_ENV: "e2e", SITE_URL: WEB_URL, BOT_SECRET: "e2e-bot-secret-value-for-tests", E2E_WEB_URL: WEB_URL, E2E_CRM_URL: CRM_URL, E2E_ADMIN_URL: ADMIN_URL };

export default defineConfig({
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./global-setup.ts",
  use: { trace: "retain-on-failure", storageState: REJECTED_STATE },
  projects: [
    { name: "web", testDir: "../apps/web/e2e", use: { baseURL: WEB_URL } },
    { name: "admin", testDir: "../apps/admin/e2e", use: { baseURL: ADMIN_URL } },
    { name: "crm", testDir: "../apps/crm/e2e", use: { baseURL: CRM_URL } },
  ],
  // The readiness URLs must NOT touch the database: Playwright starts the servers BEFORE the global setup creates the throwaway database
  // (a /api/health URL waits forever on a fresh machine; it only worked locally because an old database was left over).
  webServer: [
    {
      command: `${build}pnpm exec next start -p ${WEB_PORT}`,
      cwd: "../apps/web", url: `${WEB_URL}/robots.txt`, timeout: 600_000, reuseExistingServer: false,
      env: { ...base, DATABASE_URL: E2E_WEB_DB, NEXT_DIST_DIR: ".next-e2e", CRM_INTERNAL_URL: CRM_URL, ADMIN_URL },   // /api/forms/* is forwarded to the CRM app (no Caddy here); ADMIN_URL: the admin app has its own port here (one origin behind Caddy)
    },
    {
      command: `${build}pnpm exec next start -p ${CRM_PORT}`,
      cwd: "../apps/crm", url: `${CRM_URL}/robots.txt`, timeout: 600_000, reuseExistingServer: false,
      env: { ...base, DATABASE_URL: E2E_CRM_DB, NEXT_DIST_DIR: ".next-e2e", WEB_INTERNAL_URL: WEB_URL },   // after a form changes, the CRM app expires the website's cache
    },
    {
      command: `${build}pnpm exec next start -p ${ADMIN_PORT}`,
      cwd: "../apps/admin", url: `${ADMIN_URL}/robots.txt`, timeout: 600_000, reuseExistingServer: false,
      // after every change the CMS expires the website's cache; the editor frames the website's preview (own ports here, one origin behind Caddy)
      env: { ...base, DATABASE_URL: E2E_ADMIN_DB, NEXT_DIST_DIR: ".next-e2e", WEB_INTERNAL_URL: WEB_URL, WEB_PREVIEW_URL: WEB_URL },
    },
  ],
});
