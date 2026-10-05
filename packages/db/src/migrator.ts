// Applies plain SQL files from /db/migrations in order, once each.
import postgres from "postgres";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** The repo's db/migrations folder, found by walking up from where the process runs (any app, the e2e runner or a script). */
export function findMigrationsDir(from = process.cwd()): string {
  for (let d = from; ; d = dirname(d)) {
    if (existsSync(join(d, "db/migrations"))) return join(d, "db/migrations");
    if (dirname(d) === d) throw new Error("db/migrations not found (run from inside the repository)");
  }
}

/** Applies db/grants.sql (database permissions per app). Needs the roles apex_web, apex_admin, apex_crm and apex_forms to exist. Run as the owner, after migrations. */
export async function applyGrants(url: string, file = join(dirname(findMigrationsDir()), "grants.sql")) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    for (const role of ["apex_web", "apex_admin", "apex_crm", "apex_forms"]) {
      const [r] = await sql`select 1 as ok from pg_roles where rolname = ${role}`;
      if (!r) throw new Error(`Database role "${role}" does not exist: create it first (see deploy/ionos/README.md), or leave APPLY_GRANTS unset.`);
    }
    await sql.unsafe(readFileSync(file, "utf8"));
  } finally { await sql.end(); }
}

export async function migrate(url: string, dir = findMigrationsDir()) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  const applied: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(dir, file), "utf8"));
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    applied.push(file);
  }
  await sql.end();
  return applied;
}
