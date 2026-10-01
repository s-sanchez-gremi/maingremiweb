// Applies plain SQL files from /db/migrations in order, once each.
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function migrate(url: string, dir = join(process.cwd(), "../../db/migrations")) {
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
