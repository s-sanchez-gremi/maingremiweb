// Orchestrates one import run: reads the configured Notion databases, loads them in ONE transaction, prints a report.
// A dry run executes everything and then rolls the transaction back, so the report shows exactly what a real run would do.
import type { db as Db } from "@apex/db";
import { importCompanies } from "./companies";
import { importGala, importVisits } from "./events";
import { importGeneric, TARGETS } from "./generic";
import { queryDatabase, type Row } from "./notion";
import { formatReport, type Report } from "./report";

export type Sources = { companies?: string[]; former?: string[]; gala?: string[]; visits?: string[]; labour?: string[]; training?: string[]; sponsors?: string[]; jobseekers?: string[] };
export type Options = { minTier?: number; db: typeof Db; read: (databaseId: string) => Promise<Row[]>; sources: Sources; dryRun: boolean; overwrite?: boolean; erp?: boolean; only?: (keyof Sources)[] };
class Rollback extends Error {}

export const readerFor = (token: string, fetchImpl?: typeof fetch) => async (id: string) => { const out: Row[] = []; for await (const r of queryDatabase(token, id, fetchImpl)) out.push(r); return out; };
const readAll = async (read: Options["read"], ids: string[] = []) => (await Promise.all(ids.map(read))).flat();

export async function runImport(o: Options): Promise<{ reports: Report[]; text: string }> {
  const reports: Report[] = [];
  const want = (k: keyof Sources) => (o.only ? o.only.includes(k) : true) && (o.sources[k]?.length ?? 0) > 0;
  try {
    await o.db.transaction(async (tx) => {
      const ctx = { db: tx as unknown as typeof Db, overwrite: o.overwrite, erp: o.erp, minTier: o.minTier };
      // reading happens inside the run so a Notion error aborts before anything is written
      let idmap = new Map<string, string>();
      if (want("companies")) { const r = await importCompanies(ctx, await readAll(o.read, o.sources.companies)); reports.push(r.report); idmap = r.idmap; }
      if (want("former")) { const r = await importCompanies(ctx, await readAll(o.read, o.sources.former), { forceStatus: "former", label: "Exagremiats (Baixa agremiat)" }); reports.push(r.report); for (const [k, v] of r.idmap) idmap.set(k, v); }
      if (want("gala")) reports.push(await importGala(ctx, await readAll(o.read, o.sources.gala), idmap));
      if (want("visits")) reports.push(await importVisits(ctx, await readAll(o.read, o.sources.visits), idmap));
      for (const k of ["labour", "training", "sponsors", "jobseekers"] as const) if (want(k)) reports.push(await importGeneric(ctx, k, await readAll(o.read, o.sources[k])));
      if (o.dryRun) throw new Rollback();
    });
  } catch (e) { if (!(e instanceof Rollback)) throw e; }
  const text = [o.dryRun ? "DRY RUN: nothing was written (rolled back)." : "IMPORT DONE (committed).", ...reports.map(formatReport)].join("\n");
  return { reports, text };
}

export { TARGETS };
