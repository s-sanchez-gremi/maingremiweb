// Shared by the end-to-end specs of every app. All apps run as REAL production builds against ONE throwaway database,
// because the product is made of cooperating apps (the website draws a form, the CRM app receives the submission).
// E2E_PORT_OFFSET shifts every port (like E2E_DB_NAME for the database): two people or sessions can run the suite on one machine at once.
const OFFSET = Number(process.env.E2E_PORT_OFFSET ?? 0);
export const WEB_PORT = 3100 + OFFSET;
export const CRM_PORT = 3101 + OFFSET;
export const FORMS_PORT = 3102 + OFFSET;
export const ADMIN_PORT = 3103 + OFFSET;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const CRM_URL = `http://localhost:${CRM_PORT}`;
export const FORMS_URL = `http://localhost:${FORMS_PORT}`;
export const ADMIN_URL = `http://localhost:${ADMIN_PORT}`;
// E2E_DB_NAME lets two people (or two Claude sessions) on one machine run the suite at the same time without recreating each other's database.
export const E2E_DB_NAME = process.env.E2E_DB_NAME ?? "apex_e2e";
export const E2E_DB = `postgres://apex:apex@localhost:5432/${E2E_DB_NAME}`;   // the OWNER: migrations and test setup only
// The servers connect as the restricted per-app users of db/grants.sql, so every end-to-end test also proves the permissions are right.
// E2E_OWNER_DB=1 runs them as the owner instead (to tell a permissions problem from a code problem).
const owner = !!process.env.E2E_OWNER_DB;
export const E2E_WEB_DB = owner ? E2E_DB : `postgres://apex_web:e2e-web-password@localhost:5432/${E2E_DB_NAME}`;
export const E2E_CRM_DB = owner ? E2E_DB : `postgres://apex_crm:e2e-crm-password@localhost:5432/${E2E_DB_NAME}`;
export const E2E_FORMS_DB = owner ? E2E_DB : `postgres://apex_forms:e2e-forms-password@localhost:5432/${E2E_DB_NAME}`;
export const E2E_ADMIN_DB = owner ? E2E_DB : `postgres://apex_admin:e2e-admin-password@localhost:5432/${E2E_DB_NAME}`;
export const CRON_SECRET = "e2e-cron-secret-value";

// Every test starts as a visitor who already answered the cookie banner ("reject all"), so the banner does not cover
// other tests' buttons. The consent tests clear this on purpose.
const rejected = encodeURIComponent(JSON.stringify({ v: 1, t: new Date().toISOString(), attribution: false, embeds: false }));
export const REJECTED_STATE = { cookies: [{ name: "apex_consent", value: rejected, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 86400, httpOnly: false, secure: false, sameSite: "Lax" as const }], origins: [] };
