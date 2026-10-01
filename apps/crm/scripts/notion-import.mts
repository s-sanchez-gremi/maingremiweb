// Usage (from apps/crm):  pnpm notion:import [--dry-run] [--overwrite] [--no-erp] [--min-tier 5] [--only companies,gala,...]
// Needs NOTION_TOKEN (internal integration secret; the databases must be shared with that integration) and the database ids:
//   NOTION_DB_COMPANIES (comma-separated: every copy of the Agremiats/Empreses database), NOTION_DB_FORMER ("Baixa agremiat": former members), NOTION_DB_EXTERNAL ("Externes": non-member companies, no ERP records), NOTION_DB_GALA, NOTION_DB_VISITS,
//   NOTION_DB_LABOUR ("id:Event name" per list, comma-separated: each Laboral list becomes an event with attendance), NOTION_DB_TRAINING (Bonificada), NOTION_DB_SPONSORS, NOTION_DB_JOBSEEKERS.
// Always run with --dry-run first, on a throwaway database (see docs/notion-import.md). Notion is only read, never changed.
import { db } from "@apex/db";
import { readerFor, runImport, type Sources } from "../lib/notion-import/index";

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const only = args.find((a, i) => args[i - 1] === "--only")?.split(",") as (keyof Sources)[] | undefined;
const token = process.env.NOTION_TOKEN;
if (!token) { console.error("NOTION_TOKEN is not set (see docs/notion-import.md)."); process.exit(1); }
const ids = (k: string) => (process.env[k] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const sources: Sources = { companies: ids("NOTION_DB_COMPANIES"), former: ids("NOTION_DB_FORMER"), external: ids("NOTION_DB_EXTERNAL"), gala: ids("NOTION_DB_GALA"), visits: ids("NOTION_DB_VISITS"), labour: ids("NOTION_DB_LABOUR"), training: ids("NOTION_DB_TRAINING"), sponsors: ids("NOTION_DB_SPONSORS"), jobseekers: ids("NOTION_DB_JOBSEEKERS") };
if (!Object.values(sources).some((s) => s && s.length)) { console.error("No NOTION_DB_* variable is set: nothing to import."); process.exit(1); }

try {
  const { text } = await runImport({ db, read: readerFor(token), sources, dryRun: flag("--dry-run"), overwrite: flag("--overwrite"), erp: !flag("--no-erp"), minTier: Number(args.find((a, i) => args[i - 1] === "--min-tier") ?? 5), only });
  console.log(text);
  process.exit(0);
} catch (e) {
  // never print the error object: database errors carry the offending row (personal data)
  const x = e as { message?: string; cause?: { code?: string; constraint_name?: string; table_name?: string } };
  const c = x.cause ?? (e as typeof x.cause);
  console.error(`Import failed and was rolled back. ${c?.code ? `Database error ${c.code} on ${c.table_name ?? "?"} (${c.constraint_name ?? "?"}).` : (x.message ?? "").split("\n")[0].slice(0, 200)}`);
  process.exit(1);
}
