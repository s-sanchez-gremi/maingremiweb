import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { hash } from "@node-rs/argon2";
import { migrate } from "@apex/db/migrator";
import { E2E_DB } from "./constants";

export default async function globalSetup() {
  const admin = postgres("postgres://apex:apex@localhost:5432/postgres", { max: 1, onnotice: () => {} });
  await admin.unsafe("drop database if exists apex_e2e with (force)");
  await admin.unsafe("create database apex_e2e");
  await admin.end();
  await migrate(E2E_DB);

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
