// End-to-end tests: every app as a REAL production build (web on 3100, CRM on 3101, forms on 3102, admin on 3103) on one throwaway database (apex_e2e).
// Needs the local Docker services (Postgres + S3 mock + Mailpit): `docker compose up -d`.
// Specs live with their app: apps/web/e2e (public site), apps/admin/e2e (CMS), apps/crm/e2e (CRM, projects, ERP, portal) and apps/forms/e2e.
import { defineConfig } from "@playwright/test";
import { ADMIN_PORT, ADMIN_URL, CRM_PORT, CRM_URL, CRON_SECRET, E2E_ADMIN_DB, E2E_CRM_DB, E2E_FORMS_DB, E2E_WEB_DB, FORMS_PORT, FORMS_URL, HUB_PORT, HUB_URL, REJECTED_STATE, WEB_PORT, WEB_URL } from "./constants";

// scripts/ci.sh builds the apps one after the other BEFORE the tests (E2E_PREBUILT=1): two builds at once starve a small CI runner.
const prebuilt = !!process.env.E2E_PREBUILT;
const build = prebuilt ? "" : "rm -rf .next-e2e .next/types .next/dev/types && pnpm exec next build && ";

const base = { CRON_SECRET, APP_ENV: "e2e", SITE_URL: WEB_URL, BOT_SECRET: "e2e-bot-secret-value-for-tests", E2E_WEB_URL: WEB_URL, E2E_CRM_URL: CRM_URL, E2E_FORMS_URL: FORMS_URL, E2E_ADMIN_URL: ADMIN_URL, E2E_HUB_URL: HUB_URL };

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
    { name: "forms", testDir: "../apps/forms/e2e", use: { baseURL: FORMS_URL } },
    { name: "hub", testDir: "../apps/hub/e2e", use: { baseURL: HUB_URL } },
  ],
  // The readiness URLs must NOT touch the database: Playwright starts the servers BEFORE the global setup creates the throwaway database
  // (a /api/health URL waits forever on a fresh machine; it only worked locally because an old database was left over).
  webServer: [
    {
      command: `${build}pnpm exec next start -p ${WEB_PORT}`,
      cwd: "../apps/web", url: `${WEB_URL}/robots.txt`, timeout: 600_000, reuseExistingServer: false,
      env: { ...base, DATABASE_URL: E2E_WEB_DB, NEXT_DIST_DIR: ".next-e2e", FORMS_INTERNAL_URL: FORMS_URL, ADMIN_URL },   // /api/forms/* is forwarded to the Forms app (no Caddy here); ADMIN_URL: the admin app has its own origin (its own port here, its own host in production)
    },
    {
      command: `${build}pnpm exec next start -p ${CRM_PORT}`,
      cwd: "../apps/crm", url: `${CRM_URL}/robots.txt`, timeout: 600_000, reuseExistingServer: false,
      env: { ...base, DATABASE_URL: E2E_CRM_DB, NEXT_DIST_DIR: ".next-e2e", FORMS_URL },   // links from the CRM to the responses of a form
    },
    {
      command: `${build}pnpm exec next start -p ${FORMS_PORT}`,
      cwd: "../apps/forms", url: `${FORMS_URL}/robots.txt`, timeout: 600_000, reuseExistingServer: false,
      env: { ...base, DATABASE_URL: E2E_FORMS_DB, NEXT_DIST_DIR: ".next-e2e", WEB_INTERNAL_URL: WEB_URL, WEBHOOK_ALLOW_PRIVATE: "1" },   // after a form changes, the Forms app expires the website's cache
    },
    {
      command: `${build}pnpm exec next start -p ${ADMIN_PORT}`,
      cwd: "../apps/admin", url: `${ADMIN_URL}/robots.txt`, timeout: 600_000, reuseExistingServer: false,
      // after every change the CMS expires the website's cache; the editor frames the website's preview (own ports here, own hosts in production)
      env: { ...base, DATABASE_URL: E2E_ADMIN_DB, NEXT_DIST_DIR: ".next-e2e", WEB_INTERNAL_URL: WEB_URL, WEB_PREVIEW_URL: WEB_URL },
    },
    {
      // The Hub has no database: it only needs the addresses of the other apps (and no e-signature address, to show "coming soon").
      command: `${build}pnpm exec next start -p ${HUB_PORT}`,
      cwd: "../apps/hub", url: `${HUB_URL}/robots.txt`, timeout: 600_000, reuseExistingServer: false,
      env: { ...base, NEXT_DIST_DIR: ".next-e2e", ADMIN_URL, CRM_URL, FORMS_URL, SITE_URL: WEB_URL, SIGN_URL: "" },
    },
  ],
});
