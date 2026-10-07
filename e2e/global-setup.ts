import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { hash } from "@node-rs/argon2";
import { applyGrants, migrate } from "@apex/db/migrator";
import { E2E_DB, E2E_DB_NAME } from "./constants";

export default async function globalSetup() {
  const admin = postgres("postgres://apex:apex@localhost:5432/postgres", { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists ${E2E_DB_NAME} with (force)`);
  await admin.unsafe(`create database ${E2E_DB_NAME}`);
  // the per-app login roles (cluster-wide, so created once and reused; the password is reset every run)
  for (const [role, pw] of [["apex_web", "e2e-web-password"], ["apex_crm", "e2e-crm-password"], ["apex_forms", "e2e-forms-password"], ["apex_admin", "e2e-admin-password"], ["apex_sign", "e2e-sign-password"]]) {
    await admin.unsafe(`do $$ begin if not exists (select from pg_roles where rolname = '${role}') then create role ${role} login; end if; end $$`);
    await admin.unsafe(`alter role ${role} login password '${pw}'`);
  }
  await admin.end();
  await migrate(E2E_DB);
  await applyGrants(E2E_DB);

  // Fresh random passwords each run; tests read them from the environment.
  const pw = () => randomBytes(12).toString("base64url");
  process.env.E2E_ADMIN_PASSWORD = pw();
  process.env.E2E_EDITOR_PASSWORD = pw();
  const sql = postgres(E2E_DB, { max: 1 });
  await sql`insert into users (email, name, role, password_hash) values
    ('admin@e2e.test', 'Admin E2E', 'admin', ${await hash(process.env.E2E_ADMIN_PASSWORD)}),
    ('editor@e2e.test', 'Editor E2E', 'editor', ${await hash(process.env.E2E_EDITOR_PASSWORD)})`;
  await sql.end();
}
