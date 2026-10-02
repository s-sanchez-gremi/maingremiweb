// Orchestrates one import run: reads the configured Notion databases, loads them in ONE transaction, prints a report.
// A dry run executes everything and then rolls the transaction back, so the report shows exactly what a real run would do.
import type { db as Db } from "@apex/db";
import { importCompanies } from "./companies";
import { importGala, importVisits } from "./events";
import { importGeneric, TARGETS } from "./generic";
import { importSponsors } from "./sponsors";
import { importRoster } from "./lists";
import { importPeople } from "./people";
import { importSuppliers } from "./suppliers";
import { importCourses, importTraining } from "./training";
import { queryDatabase, type Row } from "./notion";
import { formatReport, type Report } from "./report";

export type Sources = { companies?: string[]; former?: string[]; external?: string[]; gala?: string[]; visits?: string[]; labour?: string[]; training?: string[]; sponsors?: string[]; jobseekers?: string[]; rosters?: string[]; suppliers?: string[]; people?: string[]; courses?: string[] };
export type Options = { minTier?: number; db: typeof Db; read: (databaseId: string) => Promise<Row[]>; sources: Sources; dryRun: boolean; overwrite?: boolean; erp?: boolean; only?: (keyof Sources)[] };
class Rollback extends Error {}

export const readerFor = (token: string, fetchImpl?: typeof fetch) => async (id: string) => { const out: Row[] = []; for await (const r of queryDatabase(token, id, fetchImpl)) out.push(r); return out; };
const readAll = async (read: Options["read"], ids: string[] = []) => (await Promise.all(ids.map((i) => read(i.split(":")[0])))).flat();

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
      if (want("external")) { const r = await importCompanies(ctx, await readAll(o.read, o.sources.external), { label: "Externes (no socis)", erp: false }); reports.push(r.report); for (const [k, v] of r.idmap) idmap.set(k, v); }
      if (want("gala")) reports.push(await importGala(ctx, await readAll(o.read, o.sources.gala), idmap));
      if (want("visits")) reports.push(await importVisits(ctx, await readAll(o.read, o.sources.visits), idmap));
      // people: "id:Label" or "id:Label:Role" (role given to everyone who has none, e.g. Formador)
      if (want("people")) for (const spec of o.sources.people ?? []) { const [id, label, role] = spec.split(":"); reports.push(await importPeople(ctx, await o.read(id), idmap, { id, label: label?.trim() || `Llista ${id.slice(0, 6)}`, role: role?.trim() })); }
      // rosters: "id:Event name" per database (labour = the Laboral lists, rosters = every other event/session list)
      for (const k of ["labour", "rosters"] as const) if (want(k)) for (const spec of o.sources[k] ?? []) { const [id, ...rest] = spec.split(":"); reports.push(await importRoster(ctx, await o.read(id), idmap, { id, eventName: rest.join(":").trim() || `Llista ${id.slice(0, 6)}` })); }
      if (want("courses")) for (const spec of o.sources.courses ?? []) { const [id, ...rest] = spec.split(":"); reports.push(await importCourses(ctx, await o.read(id), rest.join(":").trim() || "Cursos")); }
      if (want("suppliers")) reports.push(await importSuppliers(ctx, await readAll(o.read, o.sources.suppliers)));
      if (want("training")) reports.push(await importTraining(ctx, await readAll(o.read, o.sources.training), idmap));
      if (want("sponsors")) reports.push(await importSponsors(ctx, await readAll(o.read, o.sources.sponsors), idmap));
      for (const k of ["jobseekers"] as const) if (want(k)) reports.push(await importGeneric(ctx, k, await readAll(o.read, o.sources[k])));
      if (o.dryRun) throw new Rollback();
    });
  } catch (e) { if (!(e instanceof Rollback)) throw e; }
  const text = [o.dryRun ? "DRY RUN: nothing was written (rolled back)." : "IMPORT DONE (committed).", ...reports.map(formatReport)].join("\n");
  return { reports, text };
}

export { TARGETS };
