import { describe, expect, it } from "vitest";
import { checkEnv, shouldCheck } from "../env-check";

const good = {
  NODE_ENV: "production", APP_ENV: "production", DATABASE_URL: "postgres://apex_app:Zr8tQ2vLw9@db.internal:5432/apex", SITE_URL: "https://apex.example",
  S3_ENDPOINT: "https://s3.eu.example", S3_BUCKET: "apex-media", S3_PRIVATE_BUCKET: "apex-private", S3_PUBLIC_URL: "https://media.apex.example",
  S3_ACCESS_KEY: "AKIAEXAMPLE", S3_SECRET_KEY: "s3cr3t-value-0123456789", SMTP_URL: "smtp://user:pw@mail.example:587", MAIL_FROM: "Apex <no-reply@apex.example>",
  CRON_SECRET: "a3f9c1d2e4b5a6978877665544332211", BOT_SECRET: "0123456789abcdef0123456789abcdef0123",
};

describe("startup configuration check", () => {
  it("only runs for staging/production servers, never for local, test or build", () => {
    expect(shouldCheck({ NODE_ENV: "production", APP_ENV: "production" })).toBe(true);
    expect(shouldCheck({ NODE_ENV: "production", APP_ENV: "staging" })).toBe(true);
    expect(shouldCheck({ NODE_ENV: "production", APP_ENV: "e2e" })).toBe(false);
    expect(shouldCheck({ NODE_ENV: "production" })).toBe(false);
    expect(shouldCheck({ NODE_ENV: "development", APP_ENV: "production" })).toBe(false);
  });
  it("accepts a proper configuration", () => expect(checkEnv(good)).toEqual([]));
  it("reports every missing value", () => {
    const problems = checkEnv({ NODE_ENV: "production", APP_ENV: "production" });
    for (const k of ["DATABASE_URL", "SITE_URL", "S3_BUCKET", "S3_PRIVATE_BUCKET", "SMTP_URL", "CRON_SECRET", "BOT_SECRET", "S3_ACCESS_KEY"]) expect(problems.join("\n")).toContain(k);
  });
  it("refuses placeholder and weak secrets and the local development values", () => {
    expect(checkEnv({ ...good, CRON_SECRET: "change-me" }).join()).toMatch(/CRON_SECRET/);
    expect(checkEnv({ ...good, BOT_SECRET: "short" }).join()).toMatch(/BOT_SECRET/);
    expect(checkEnv({ ...good, DATABASE_URL: "postgres://apex:apex@localhost:5432/apex" }).join()).toMatch(/development password/);
    expect(checkEnv({ ...good, S3_SECRET_KEY: "apexapexapex" }).join()).toMatch(/development value/);
  });
  it("requires https in production (staging may use http), and two different buckets", () => {
    expect(checkEnv({ ...good, SITE_URL: "http://apex.example" }).join()).toMatch(/https/);
    expect(checkEnv({ ...good, APP_ENV: "staging", SITE_URL: "http://staging.internal" })).toEqual([]);
    expect(checkEnv({ ...good, S3_PRIVATE_BUCKET: "apex-media" }).join()).toMatch(/must be different/);
  });
});
