// Shared by the end-to-end specs of every app. Both apps run as REAL production builds against ONE throwaway database,
// because the product is made of cooperating apps (the website draws a form, the CRM app receives the submission).
export const WEB_PORT = 3100;
export const CRM_PORT = 3101;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const CRM_URL = `http://localhost:${CRM_PORT}`;
export const E2E_DB = "postgres://apex:apex@localhost:5432/apex_e2e";
export const CRON_SECRET = "e2e-cron-secret-value";

// Every test starts as a visitor who already answered the cookie banner ("reject all"), so the banner does not cover
// other tests' buttons. The consent tests clear this on purpose.
const rejected = encodeURIComponent(JSON.stringify({ v: 1, t: new Date().toISOString(), attribution: false, embeds: false }));
export const REJECTED_STATE = { cookies: [{ name: "apex_consent", value: rejected, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 86400, httpOnly: false, secure: false, sameSite: "Lax" as const }], origins: [] };
