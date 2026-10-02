// Notion "Proveïdors" -> ERP suppliers (name, e-mail; location, web, LinkedIn, contact person, origin and notes as readable lines).
import { eq } from "drizzle-orm";
import { suppliers } from "@apex/db/schema";
import type { Ctx } from "./companies";
import { bump, newReport } from "./report";
import { mask, noteLines, str, type Row } from "./notion";

export async function importSuppliers(ctx: Ctx, rows: Row[]) {
  const { db } = ctx;
  const report = newReport("Proveïdors");
  report.read = rows.length;
  for (const r of rows) {
    if (!r.title || r.trashed) { report.skipped++; bump(report, "skipped: row has no name"); continue; }
    const email = str(r.props["MAIL"]).toLowerCase();
    const vals = { name: r.title, email: email.includes("@") ? email : "", notes: noteLines(r, ["MAIL"]), externalRef: r.id };
    const [exists] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.externalRef, r.id));
    if (exists) { if (ctx.overwrite) { await db.update(suppliers).set(vals).where(eq(suppliers.id, exists.id)); report.updated++; } else report.skipped++; continue; }
    await db.insert(suppliers).values(vals);
    report.created++;
    if (report.samples.length < 5) report.samples.push(mask(r.title));
  }
  return report;
}
