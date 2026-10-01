// ERP registry logic (Apex only REGISTERS; Sage keeps the accounting). Plain DB logic, no Next imports, so it is testable.
import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { costCenters, erpCategories, erpEntries, feeTiers, members, subscriptions, suppliers } from "@apex/db/schema";
import { VAT_RATES, parseEuros, plainEuros, vatOf } from "@apex/core/money";
import { matchAll } from "@apex/core/search";

export class ErpError extends Error {}
export const PAGE_SIZE = 50;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(s + "T12:00:00Z"));

// ---- entries (one table for expenses and income) ----
export type EntryInput = {
  kind: string; occurredOn: string; description: string; supplierId?: string | null; memberId?: string | null; counterparty?: string;
  categoryId?: string | null; costCenterId?: string | null; base: string; vatBp: number; docNumber?: string; dueOn?: string; paidOn?: string;
  paymentMethod?: string; feePeriod?: string; notes?: string;
};

/** Checks the raw form values and returns database values, or throws a message for the user (in Catalan). */
export function checkEntry(i: EntryInput) {
  if (i.kind !== "expense" && i.kind !== "income") throw new ErpError("Tipus no vàlid");
  const description = i.description.trim().slice(0, 300);
  if (!description) throw new ErpError("Indica la descripció");
  if (!validDate(i.occurredOn)) throw new ErpError("Data no vàlida");
  const base = parseEuros(i.base);
  if (base === null) throw new ErpError("Import no vàlid (exemple: 1.234,56)");
  if (!(VAT_RATES as readonly number[]).includes(i.vatBp)) throw new ErpError("IVA no vàlid");
  for (const [d, label] of [[i.dueOn, "venciment"], [i.paidOn, "pagament"]] as const) if (d && !validDate(d)) throw new ErpError(`Data de ${label} no vàlida`);
  const vat = vatOf(base, i.vatBp);
  return {
    kind: i.kind as "expense" | "income", occurredOn: i.occurredOn, description,
    supplierId: i.supplierId || null, memberId: i.memberId || null, counterparty: (i.counterparty ?? "").trim().slice(0, 200),
    categoryId: i.categoryId || null, costCenterId: i.costCenterId || null,
    baseCents: base, vatBp: i.vatBp, vatCents: vat, totalCents: base + vat,
    docNumber: (i.docNumber ?? "").trim().slice(0, 80), dueOn: i.dueOn || null, paidOn: i.paidOn || null,
    paymentMethod: (i.paymentMethod ?? "").trim().slice(0, 40), feePeriod: (i.feePeriod ?? "").trim().slice(0, 20), notes: (i.notes ?? "").trim().slice(0, 2000),
  };
}

/** The name is copied onto the row, so it survives deleting the supplier or member (financial rows are kept). */
async function counterpartyOf(v: { counterparty: string; supplierId: string | null; memberId: string | null }) {
  if (v.counterparty) return v.counterparty;
  if (v.supplierId) return (await db.select({ n: suppliers.name }).from(suppliers).where(eq(suppliers.id, v.supplierId)))[0]?.n ?? "";
  if (v.memberId) return (await db.select({ n: members.name }).from(members).where(eq(members.id, v.memberId)))[0]?.n ?? "";
  return "";
}

export async function saveEntry(id: string | null, input: EntryInput, userId: string) {
  const v = checkEntry(input);
  const values = { ...v, counterparty: await counterpartyOf(v) };
  if (id) {
    await db.update(erpEntries).set({ ...values, updatedAt: new Date() }).where(and(eq(erpEntries.id, id), isNull(erpEntries.voidedAt)));
    return id;
  }
  const [r] = await db.insert(erpEntries).values({ ...values, createdBy: userId }).returning({ id: erpEntries.id });
  return r.id;
}

export const voidEntry = (id: string) => db.update(erpEntries).set({ voidedAt: new Date(), updatedAt: new Date() }).where(eq(erpEntries.id, id));
export const markPaid = async (id: string, paidOn: string, method = "") => {
  if (!validDate(paidOn)) throw new ErpError("Data de pagament no vàlida");
  await db.update(erpEntries).set({ paidOn, paymentMethod: method.slice(0, 40), updatedAt: new Date() }).where(eq(erpEntries.id, id));
};

export type EntryFilter = { kind?: string; q?: string; from?: string; to?: string; costCenter?: string; category?: string; member?: string; status?: string; page?: number };
const uuid = (s?: string) => (s && /^[0-9a-f-]{36}$/.test(s) ? s : undefined);
const today = () => new Date().toISOString().slice(0, 10);

const entryWhere = (f: EntryFilter) => and(
  isNull(erpEntries.voidedAt),
  f.kind === "expense" || f.kind === "income" ? eq(erpEntries.kind, f.kind) : undefined,
  f.from && validDate(f.from) ? gte(erpEntries.occurredOn, f.from) : undefined,
  f.to && validDate(f.to) ? lte(erpEntries.occurredOn, f.to) : undefined,
  uuid(f.costCenter) ? eq(erpEntries.costCenterId, uuid(f.costCenter)!) : undefined,
  uuid(f.category) ? eq(erpEntries.categoryId, uuid(f.category)!) : undefined,
  uuid(f.member) ? eq(erpEntries.memberId, uuid(f.member)!) : undefined,
  f.status === "paid" ? sql`${erpEntries.paidOn} is not null` : undefined,
  f.status === "unpaid" ? sql`${erpEntries.paidOn} is null` : undefined,
  f.status === "overdue" ? sql`${erpEntries.paidOn} is null and ${erpEntries.dueOn} < ${today()}` : undefined,
  matchAll(sql`${erpEntries.description} || ' ' || ${erpEntries.counterparty} || ' ' || ${erpEntries.docNumber} || ' ' || ${erpEntries.notes}`, f.q),
);

export async function listEntries(f: EntryFilter, opts: { all?: boolean } = {}) {
  const q = db.select({ e: erpEntries, category: erpCategories.name, sage: erpCategories.sageAccount, costCenter: costCenters.name, supplierTaxId: suppliers.taxId, memberTaxId: members.taxId })
    .from(erpEntries).leftJoin(erpCategories, eq(erpCategories.id, erpEntries.categoryId)).leftJoin(costCenters, eq(costCenters.id, erpEntries.costCenterId))
    .leftJoin(suppliers, eq(suppliers.id, erpEntries.supplierId)).leftJoin(members, eq(members.id, erpEntries.memberId))
    .where(entryWhere(f)).orderBy(desc(erpEntries.occurredOn), desc(erpEntries.createdAt));
  const [rows, [t]] = await Promise.all([
    opts.all ? q.limit(20000) : q.limit(PAGE_SIZE).offset(Math.max(0, (f.page ?? 1) - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int`, base: sql<number>`coalesce(sum(${erpEntries.baseCents}), 0)::bigint`, vat: sql<number>`coalesce(sum(${erpEntries.vatCents}), 0)::bigint`, total: sql<number>`coalesce(sum(${erpEntries.totalCents}), 0)::bigint` })
      .from(erpEntries).where(entryWhere(f)),
  ]);
  return { rows, total: Number(t.n), sums: { base: Number(t.base), vat: Number(t.vat), total: Number(t.total) } };
}

// ---- overview ----
export async function summary(year: number) {
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const inYear = and(isNull(erpEntries.voidedAt), gte(erpEntries.occurredOn, from), lte(erpEntries.occurredOn, to));
  const [byKind, byCenter, byCategory, unpaid, renewals] = await Promise.all([
    db.select({ kind: erpEntries.kind, base: sql<number>`sum(${erpEntries.baseCents})::bigint`, total: sql<number>`sum(${erpEntries.totalCents})::bigint` }).from(erpEntries).where(inYear).groupBy(erpEntries.kind),
    db.select({ name: costCenters.name, kind: erpEntries.kind, base: sql<number>`sum(${erpEntries.baseCents})::bigint` }).from(erpEntries).leftJoin(costCenters, eq(costCenters.id, erpEntries.costCenterId)).where(inYear).groupBy(costCenters.name, erpEntries.kind).orderBy(costCenters.name),
    db.select({ name: erpCategories.name, kind: erpEntries.kind, base: sql<number>`sum(${erpEntries.baseCents})::bigint` }).from(erpEntries).leftJoin(erpCategories, eq(erpCategories.id, erpEntries.categoryId)).where(inYear).groupBy(erpCategories.name, erpEntries.kind).orderBy(erpCategories.name),
    db.select({ kind: erpEntries.kind, n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${erpEntries.totalCents}), 0)::bigint`, overdue: sql<number>`count(*) filter (where ${erpEntries.dueOn} < ${today()})::int` })
      .from(erpEntries).where(and(isNull(erpEntries.voidedAt), isNull(erpEntries.paidOn))).groupBy(erpEntries.kind),
    db.select().from(subscriptions).where(and(eq(subscriptions.active, true), lte(subscriptions.nextRenewal, new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)))).orderBy(asc(subscriptions.nextRenewal)),
  ]);
  const num = (n: unknown) => Number(n ?? 0);
  const k = (kind: string) => byKind.find((r) => r.kind === kind);
  return {
    income: num(k("income")?.base), expense: num(k("expense")?.base), incomeTotal: num(k("income")?.total), expenseTotal: num(k("expense")?.total),
    byCenter: byCenter.map((r) => ({ ...r, base: num(r.base) })), byCategory: byCategory.map((r) => ({ ...r, base: num(r.base) })),
    unpaid: unpaid.map((r) => ({ ...r, total: num(r.total) })), renewals,
  };
}

// ---- subscriptions: "the invoice arrived" -> register the expense and move the renewal date ----
const addPeriod = (date: string, period: string) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + (period === "monthly" ? 1 : period === "quarterly" ? 3 : 12));
  return d.toISOString().slice(0, 10);
};
export async function renewSubscription(id: string, userId: string) {
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id));
    if (!s) throw new ErpError("Subscripció no trobada");
    const on = s.nextRenewal ?? today();
    const name = s.supplierId ? (await tx.select({ n: suppliers.name }).from(suppliers).where(eq(suppliers.id, s.supplierId)))[0]?.n ?? "" : "";
    await tx.insert(erpEntries).values({
      kind: "expense", occurredOn: on, description: s.name, supplierId: s.supplierId, counterparty: name, categoryId: s.categoryId, costCenterId: s.costCenterId,
      baseCents: s.amountCents, vatBp: 0, vatCents: 0, totalCents: s.amountCents, subscriptionId: s.id, createdBy: userId,
      notes: "Registrat des de la subscripció. Revisa l'IVA i el número de factura.",
    });
    await tx.update(subscriptions).set({ nextRenewal: addPeriod(on, s.period) }).where(eq(subscriptions.id, id));
  });
}

// ---- member fees: one charge per member per period, in bulk, with a preview ----
export function periodRange(period: string): { start: string; end: string; kind: "annual" | "quarterly" } | null {
  const a = /^(\d{4})$/.exec(period), q = /^(\d{4})-T([1-4])$/.exec(period);
  if (a) return { start: `${a[1]}-01-01`, end: `${a[1]}-12-31`, kind: "annual" };
  if (q) { const m = (Number(q[2]) - 1) * 3 + 1; return { start: `${q[1]}-${String(m).padStart(2, "0")}-01`, end: new Date(Date.UTC(Number(q[1]), m + 2, 0)).toISOString().slice(0, 10), kind: "quarterly" }; }
  return null;
}

export async function feePreview(period: string) {
  const r = periodRange(period);
  if (!r) throw new ErpError("Període no vàlid (exemples: 2026 o 2026-T1)");
  const rows = await db.select({ m: members, t: feeTiers }).from(members).innerJoin(feeTiers, eq(feeTiers.id, members.tierId))
    .where(and(eq(members.status, "active"), eq(members.billingPeriod, r.kind), sql`(${members.joinedOn} is null or ${members.joinedOn} <= ${r.end})`, sql`(${members.leftOn} is null or ${members.leftOn} >= ${r.start})`,
      sql`not exists (select 1 from ${erpEntries} where ${erpEntries.memberId} = ${members.id} and ${erpEntries.feePeriod} = ${period} and ${erpEntries.voidedAt} is null)`))
    .orderBy(asc(members.name));
  return {
    range: r, items: rows.map(({ m, t }) => {
      const base = r.kind === "annual" ? t.annualCents : t.quarterlyCents ?? Math.round(t.annualCents / 4);
      return { member: m, tier: t, base, vatBp: t.vatBp, vat: vatOf(base, t.vatBp) };
    }),
  };
}

export async function generateFees(period: string, userId: string) {
  const { range, items } = await feePreview(period);
  const [cat] = await db.select().from(erpCategories).where(and(eq(erpCategories.kind, "income"), eq(erpCategories.name, "Quotes de socis")));
  const categoryId = cat?.id ?? (await db.insert(erpCategories).values({ kind: "income", name: "Quotes de socis" }).returning({ id: erpCategories.id }))[0].id;
  const due = new Date(range.start + "T12:00:00Z"); due.setUTCDate(due.getUTCDate() + 30);
  let created = 0;
  for (const it of items) {
    const r = await db.insert(erpEntries).values({
      kind: "income", occurredOn: range.start, description: `Quota de soci ${period}`, memberId: it.member.id, counterparty: it.member.name, categoryId,
      baseCents: it.base, vatBp: it.vatBp, vatCents: it.vat, totalCents: it.base + it.vat, dueOn: due.toISOString().slice(0, 10), feePeriod: period, createdBy: userId,
    }).onConflictDoNothing().returning({ id: erpEntries.id }); // the unique index guards against a double click
    created += r.length;
  }
  return created;
}

// ---- CSV for the gestoria (numbers are written as plain values, text cells are protected against spreadsheet formulas) ----
const cell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(rows: Awaited<ReturnType<typeof listEntries>>["rows"]) {
  const head = ["Data", "Tipus", "Document", "Tercer", "NIF", "Descripció", "Categoria", "Compte Sage", "Centre de cost", "Base", "IVA %", "IVA", "Total", "Venciment", "Pagat el", "Mètode", "Període quota"];
  const lines = [head.join(";")];
  for (const { e, category, sage, costCenter, supplierTaxId, memberTaxId } of rows) {
    lines.push([
      cell(e.occurredOn), cell(e.kind === "expense" ? "Despesa" : "Ingrés"), cell(e.docNumber), cell(e.counterparty), cell(supplierTaxId ?? memberTaxId ?? ""), cell(e.description),
      cell(category ?? ""), cell(sage ?? ""), cell(costCenter ?? ""), plainEuros(e.baseCents), String(e.vatBp / 100).replace(".", ","), plainEuros(e.vatCents), plainEuros(e.totalCents),
      cell(e.dueOn ?? ""), cell(e.paidOn ?? ""), cell(e.paymentMethod), cell(e.feePeriod),
    ].join(";"));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
