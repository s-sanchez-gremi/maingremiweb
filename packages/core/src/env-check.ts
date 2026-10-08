// Startup safety net: a staging/production server refuses to start with missing or placeholder configuration,
// instead of quietly running with insecure defaults. Pure function (easy to test); called from instrumentation.ts.
type Env = Record<string, string | undefined>;

export const shouldCheck = (env: Env) => env.NODE_ENV === "production" && ["staging", "production"].includes(env.APP_ENV ?? "");

const PLACEHOLDER = /^(change-?me|changeme|secret|password|xxx+|todo)?$/i;

export function checkEnv(env: Env, opts: { botSecret?: boolean } = { botSecret: true }): string[] {
  const problems: string[] = [];
  const need = (k: string) => { if (!env[k]?.trim()) problems.push(`${k} is not set`); return env[k]?.trim() ?? ""; };
  const secret = (k: string, min: number) => {
    const v = need(k);
    if (v && (PLACEHOLDER.test(v) || v.length < min)) problems.push(`${k} must be a real random secret (at least ${min} characters, not a placeholder)`);
  };

  const db = need("DATABASE_URL");
  if (db && !/^postgres(ql)?:\/\//.test(db)) problems.push("DATABASE_URL must be a postgres:// URL");
  if (db && /apex:apex@/.test(db)) problems.push("DATABASE_URL still uses the local development password");

  // A managed database is reached over a network: the connection must be encrypted (production only; staging may be internal).
  if (env.APP_ENV === "production" && db && !/[?&]sslmode=(require|verify-ca|verify-full)\b/.test(db)) problems.push("DATABASE_URL must end with ?sslmode=require (the managed database is reached over a network)");

  const site = need("SITE_URL");
  if (site && !/^https?:\/\/[^/]+/.test(site)) problems.push("SITE_URL must be a full URL such as https://example.com");
  if (env.APP_ENV === "production" && site && !site.startsWith("https://")) problems.push("SITE_URL must use https:// in production");

  for (const k of ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_PRIVATE_BUCKET", "S3_PUBLIC_URL", "SMTP_URL", "MAIL_FROM"]) need(k);
  if (env.S3_BUCKET && env.S3_BUCKET === env.S3_PRIVATE_BUCKET) problems.push("S3_BUCKET and S3_PRIVATE_BUCKET must be different (visitor uploads must never be public)");
  if (env.S3_SECRET_KEY === "apexapexapex") problems.push("S3_SECRET_KEY still uses the local development value");
  need("S3_ACCESS_KEY"); need("S3_SECRET_KEY");

  // Webhooks may only call public servers: the switch that lets them call this machine is for development and tests, never for a real environment.
  if (env.WEBHOOK_ALLOW_PRIVATE) problems.push("WEBHOOK_ALLOW_PRIVATE must not be set in staging or production (webhooks would be able to reach internal addresses)");
  secret("CRON_SECRET", 24);
  if (opts.botSecret) secret("BOT_SECRET", 32); // only the app that runs the public form pipeline needs it
  return problems;
}
