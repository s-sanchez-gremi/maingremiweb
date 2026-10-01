// Notion "Patrocinadors": a sponsor PROSPECT pipeline (who we approached for which event, last contact, follow-up, proposal, budget).
// Each row becomes a Sponsor (status "Potencial"); everything the structure has no column for is kept as readable lines in the notes,
// the company is linked when its name matches exactly one company, and a budget that is a plain amount becomes the amount.
import { eq } from "drizzle-orm";
import { sponsors } from "@apex/db/schema";
import { parseEuros } from "@apex/core/money";
import type { Ctx } from "./companies";
import { companyMatcher } from "./events";
import { bump, newReport } from "./report";
import { mask, str, type Row } from "./notion";

const line = (label: string, v: string) => (v ? `${label}: ${v}` : "");

export async function importSponsors(ctx: Ctx, rows: Row[], idmap: Map<string, string>) {
  const { db } = ctx;
  const report = newReport("Patrocinadors");
  report.read = rows.length;
  const findCompany = await companyMatcher(ctx, idmap);
  for (const r of rows) {
    const p = r.props;
    const name = r.title;
    if (!name || r.trashed) { report.skipped++; bump(report, "skipped: row has no name"); continue; }
    const events = Array.isArray(p["esdeveniments"]) ? (p["esdeveniments"] as string[]).join(", ") : "";
    const budget = str(p["pressupost"]);
    // a budget such as "5.000 €" or "1.500,50" is an amount; anything else stays text in the notes
    const amountCents = /^[\d.,\s]+€?$/.test(budget) ? parseEuros(budget.replace(/[€\s]/g, "")) : null;
    if (budget && amountCents === null) bump(report, "budgets kept as text");
    const companyId = findCompany(p["📜 Empreses"], name);
    const notes = [
      line("Esdeveniments", events), line("Membre", Array.isArray(p["agremiat"]) ? (p["agremiat"] as string[]).join(", ") : ""), line("Contactat", p["contactats"] === true ? "sí" : ""),
      line("Últim contacte", str(p["últim contacte"])), line("Contacte", str(p["persona de contacte"])), line("Activitat", str(p["descripció activitat"])),
      line("Proposta", str(p["proposta"])), line("Pressupost", amountCents === null ? budget : ""), line("Desglossament", str(p["desglossament press."])),
      line("Seguiment", str(p["seguiment"])), line("Històric", str(p["històric"])),
    ].filter(Boolean).join("\n");
    const vals = { name, kind: "sponsor", status: "prospect", year: null, amountCents, companyId, notes, externalRef: r.id };
    if (companyId) bump(report, "linked to a company");
    const [exists] = await db.select({ id: sponsors.id }).from(sponsors).where(eq(sponsors.externalRef, r.id));
    if (exists) { if (ctx.overwrite) { await db.update(sponsors).set(vals).where(eq(sponsors.id, exists.id)); report.updated++; } else report.skipped++; continue; }
    await db.insert(sponsors).values(vals);
    report.created++;
    if (report.samples.length < 5) report.samples.push(mask(name));
  }
  return report;
}
