// Notion "Agremiats" (company databases) -> Companies (+ their contact person as a Person, + an ERP member for member companies).
// Duplicates inside Notion (the same company on several pages / nested copies) are merged by CIF, then by name.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { db as Db } from "@apex/db";
import { clients, feeTiers, members, people } from "@apex/db/schema";
import { bump, newReport, type Report } from "./report";
import { canon, first, mask, normName, normTaxId, num, str, type Row } from "./notion";

export type Ctx = { db: typeof Db; overwrite?: boolean; erp?: boolean; minTier?: number };
type Company = {
  ids: string[]; created: string; name: string; memberStatus: "member" | "former" | "prospect"; taxId: string; customerNumber: string;
  email: string; emailBilling: string; emailOther: string; phone: string; phoneOther: string; address: string; postalCode: string; city: string; province: string;
  website: string; activity: string; services: string; employees: number | null; foundedYear: number | null; getsMagazine: boolean;
  contact: string; parentIds: string[]; cuota: string; amount: number | null;
};

const STATUS: Record<string, Company["memberStatus"]> = { agremiat: "member", coagremiat: "member", matriu: "member", "antic agremiat": "former", "no agremiat": "prospect" };
const RANK = { member: 3, former: 2, prospect: 1 } as const;
// Notion keeps a placeholder "0" in empty phone cells: anything with fewer than 5 digits is not a phone number.
const phone = (v: unknown) => { const t = typeof v === "number" ? String(v) : str(v as string); return t.replace(/\D/g, "").length >= 5 ? t : ""; };

export function toCompany(r: Row): Company | null {
  const p = r.props;
  const name = first(p["Empresa"], p["Nombre"], p["Nom"], p["Name"]);
  if (!name || r.trashed) return null;
  const phones = [...new Set([phone(p["Telèfon"]), phone(p["Teléfono"]), phone(p["telefon"])].filter(Boolean))];
  const services = [...new Set([str(p["Serveis"]), str(p["Serveis oferts"])].filter(Boolean))].join("\n");
  const cn = num(p["Num. Client"]);
  return {
    ids: [r.id], created: r.createdTime, name, memberStatus: STATUS[str(p["Agremiat"]).toLowerCase()] ?? "prospect", taxId: str(p["CIF"]),
    customerNumber: cn === null ? "" : String(Math.trunc(cn)), email: str(p["Correu General"]), emailBilling: str(p["Correu Notificació"]), emailOther: str(p["Correu Newsletter"]),
    phone: phones[0] ?? "", phoneOther: phones[1] ?? "", address: str(p["Adreça"]), postalCode: str(p["Codi Postal"]), city: str(p["Municipi"]), province: str(p["provincia"]),
    website: str(p["web"]), activity: str(p["Descripció activitat"]), services, employees: num(p["num treballadors"]) ?? num(p["treballadors"]),
    foundedYear: num(p["Any fundació"]), getsMagazine: str(p["revista"]).toLowerCase() === "si", contact: str(p["Att"]),
    parentIds: Array.isArray(p["Matriu agremiat"]) ? (p["Matriu agremiat"] as string[]) : [], cuota: str(p["Cuota"]), amount: num(p["Import"]),
  };
}

/** Merge pages describing the same company: first non-empty value wins (oldest page first); the strongest member status wins. */
export function mergeCompanies(rows: Row[]) {
  const cands = rows.map(toCompany).filter((c): c is Company => !!c).sort((a, b) => a.created.localeCompare(b.created));
  const groups = new Map<string, Company[]>();
  const byName = new Map<string, string>();
  for (const c of cands) if (c.taxId) { const k = `t:${normTaxId(c.taxId)}`; groups.set(k, [...(groups.get(k) ?? []), c]); byName.set(normName(c.name), k); }
  for (const c of cands) if (!c.taxId) { const k = byName.get(normName(c.name)) ?? `n:${normName(c.name)}`; groups.set(k, [...(groups.get(k) ?? []), c]); byName.set(normName(c.name), k); }
  const merged: Company[] = [];
  for (const g of groups.values()) {
    const m = { ...g[0], ids: g.flatMap((c) => c.ids) };
    for (const c of g.slice(1)) {
      for (const k of Object.keys(m) as (keyof Company)[]) {
        if (k === "ids" || k === "created" || k === "parentIds") continue;
        const cur = m[k] as unknown;
        if ((cur === "" || cur === null || cur === false) && c[k] !== "" && c[k] !== null) (m as Record<string, unknown>)[k] = c[k];
      }
      m.parentIds = [...new Set([...m.parentIds, ...c.parentIds])];
      if (RANK[c.memberStatus] > RANK[m.memberStatus]) m.memberStatus = c.memberStatus;
    }
    merged.push(m);
  }
  return merged;
}

const COLS = ["name", "taxId", "customerNumber", "email", "emailBilling", "emailOther", "phone", "phoneOther", "address", "postalCode", "city", "province", "website", "activity", "services"] as const;
const euros = (n: number) => n.toLocaleString("ca-ES", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

/** `forceStatus`: every row of this database has that status whatever its own "Agremiat" says (the "Baixa agremiat" database = former members). */
export async function importCompanies(ctx: Ctx, rows: Row[], opts: { forceStatus?: Company["memberStatus"]; label?: string; erp?: boolean } = {}) {
  const { db } = ctx;
  const report: Report = newReport(opts.label ?? "Empreses (Agremiats)");
  report.read = rows.length;
  const merged = mergeCompanies(rows);
  if (opts.forceStatus) for (const c of merged) c.memberStatus = opts.forceStatus;
  // values the database would refuse are left empty and counted (typos in Notion, e.g. a date typed into "Any fundació")
  for (const c of merged) {
    if (c.foundedYear !== null && !(Number.isInteger(c.foundedYear) && c.foundedYear >= 1500 && c.foundedYear <= 2200)) { c.foundedYear = null; bump(report, "invalid founding years left empty"); }
    if (c.employees !== null && !(Number.isInteger(c.employees) && c.employees >= 0 && c.employees <= 10_000_000)) { c.employees = null; bump(report, "invalid employee counts left empty"); }
  }
  const idmap = new Map<string, string>(); // Notion page id -> company id
  // a fee amount shared by at least `minTier` member companies becomes a fee tier; one-off amounts stay in that member's notes
  const minTier = ctx.minTier ?? 5;
  const shared = new Map<number, number>();
  for (const c of merged) if (c.amount && c.amount > 0 && (c.memberStatus === "member" || c.memberStatus === "former")) shared.set(c.amount, (shared.get(c.amount) ?? 0) + 1);
  const created: { c: Company; id: string }[] = [];
  // companies without a CIF are matched by their cleaned-up name (legal forms, accents, punctuation ignored) when exactly one exists
  const byCanon = new Map<string, string[]>();
  for (const x of await db.select({ id: clients.id, name: clients.name }).from(clients)) { const k = canon(x.name); if (k) byCanon.set(k, [...(byCanon.get(k) ?? []), x.id]); }
  bump(report, "pages merged as duplicates", rows.filter((r) => !r.trashed).length - merged.length);
  bump(report, "companies without CIF", merged.filter((c) => !c.taxId).length);

  for (const c of merged) {
    const key = normTaxId(c.taxId);
    const existing = (await db.select().from(clients).where(c.ids.length ? inArray(clients.externalRef, c.ids) : undefined).limit(1))[0]
      ?? (key ? (await db.select().from(clients).where(sql`upper(replace(${clients.taxId}, ' ', '')) = ${key}`).limit(1))[0] : undefined)
      ?? (!key ? await (async () => { const hit = byCanon.get(canon(c.name)); return hit?.length === 1 ? (await db.select().from(clients).where(eq(clients.id, hit[0])).limit(1))[0] : undefined; })() : undefined);
    let id: string;
    if (existing) {
      id = existing.id;
      const patch: Record<string, unknown> = {};
      for (const k of COLS) if (c[k] && (ctx.overwrite || !existing[k])) patch[k] = c[k];
      if (c.employees !== null && (ctx.overwrite || existing.employees === null)) patch.employees = c.employees;
      if (c.foundedYear !== null && (ctx.overwrite || existing.foundedYear === null)) patch.foundedYear = c.foundedYear;
      if (c.getsMagazine && !existing.getsMagazine) patch.getsMagazine = true;
      if (opts.forceStatus === "former" && existing.memberStatus === "member") bump(report, "also a CURRENT member elsewhere (status left unchanged, check by hand)");
      if (c.memberStatus !== "prospect" && (ctx.overwrite || existing.memberStatus === "prospect")) patch.memberStatus = c.memberStatus;
      if (!existing.externalRef) patch.externalRef = c.ids[0];
      if (Object.keys(patch).length) { await db.update(clients).set(patch).where(eq(clients.id, id)); report.updated++; } else report.skipped++;
    } else {
      const [row] = await db.insert(clients).values({ ...Object.fromEntries(COLS.map((k) => [k, c[k]])), memberStatus: c.memberStatus, employees: c.employees, foundedYear: c.foundedYear, getsMagazine: c.getsMagazine, externalRef: c.ids[0] } as typeof clients.$inferInsert).returning({ id: clients.id });
      id = row.id; report.created++;
      { const k = canon(c.name); if (k) byCanon.set(k, [...(byCanon.get(k) ?? []), id]); }
      if (report.samples.length < 5) report.samples.push(`${mask(c.name)} · ${c.memberStatus}`);
    }
    for (const pid of c.ids) idmap.set(pid, id);
    created.push({ c, id });
  }

  for (const { c, id } of created) {
    // parent company (second pass: every company exists now)
    const parent = c.parentIds.map((p) => idmap.get(p)).find((p) => p && p !== id);
    if (parent) {
      const done = await db.update(clients).set({ parentCompanyId: parent }).where(and(eq(clients.id, id), ctx.overwrite ? undefined : isNull(clients.parentCompanyId))).returning({ id: clients.id });
      if (done.length) bump(report, "parent companies linked");
    }
    // the "Att" contact becomes a person of that company
    if (c.contact) {
      const dup = await db.select({ id: people.id }).from(people).where(and(eq(people.companyId, id), sql`lower(${people.name}) = ${c.contact.toLowerCase()}`)).limit(1);
      if (!dup.length) { await db.insert(people).values({ name: c.contact, role: "Contacte", companyId: id, source: "Notion · Agremiats", externalRef: `${c.ids[0]}#att` }).onConflictDoNothing(); bump(report, "contact people created"); }
    }
    // ERP member + fee tier (amount per year as in Notion; "Impagament" / "Sense dades" kept in the member's notes)
    if ((opts.erp ?? ctx.erp) !== false && (c.memberStatus === "member" || c.memberStatus === "former")) {
      const has = await db.select({ id: members.id }).from(members).where(eq(members.companyId, id)).limit(1);
      if (!has.length) {
        let tierId: string | null = null;
        let custom = "";
        if (c.amount && c.amount > 0 && (shared.get(c.amount) ?? 0) < minTier) { custom = `Quota anual (Notion): ${euros(c.amount)} €`; bump(report, "custom fee amounts kept in notes"); }
        else if (c.amount && c.amount > 0) {
          const tname = `Quota ${euros(c.amount)} €`;
          const [t] = await db.select({ id: feeTiers.id }).from(feeTiers).where(eq(feeTiers.name, tname));
          if (t) tierId = t.id; else { tierId = (await db.insert(feeTiers).values({ name: tname, annualCents: Math.round(c.amount * 100) }).returning({ id: feeTiers.id }))[0].id; bump(report, "fee tiers created"); }
        }
        await db.insert(members).values({ name: c.name, taxId: c.taxId, email: c.email, phone: c.phone, companyId: id, status: c.memberStatus === "former" ? "left" : "active", tierId, notes: [custom, c.cuota && c.cuota !== "Corrent pagament" ? `Quota (Notion): ${c.cuota}` : ""].filter(Boolean).join("\n") });
        bump(report, "ERP members created");
        if (c.cuota === "Impagament") bump(report, "marked unpaid in notes");
      }
    }
  }
  return { report, idmap };
}
