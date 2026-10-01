import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { costCenters, erpCategories, erpEntries, feeTiers, members, subscriptions, suppliers, users } from "@/db/schema";
import { ErpError, checkEntry, feePreview, generateFees, listEntries, markPaid, periodRange, renewSubscription, saveEntry, summary, toCsv, voidEntry } from "../erp";

let uid: string;
const base = { kind: "expense", occurredOn: "2026-03-10", description: "Paper", base: "100,00", vatBp: 2100 } as const;
beforeEach(async () => {
  for (const t of [erpEntries, subscriptions, members, feeTiers, suppliers, costCenters, erpCategories, users]) await db.delete(t);
  [{ id: uid }] = await db.insert(users).values({ email: "a@x.test", passwordHash: "x", role: "admin" }).returning({ id: users.id });
});

describe("entries", () => {
  it("validates input and computes VAT and total", () => {
    expect(checkEntry({ ...base })).toMatchObject({ baseCents: 10000, vatCents: 2100, totalCents: 12100 });
    expect(() => checkEntry({ ...base, description: " " })).toThrow(ErpError);
    expect(() => checkEntry({ ...base, base: "abc" })).toThrow(/Import/);
    expect(() => checkEntry({ ...base, vatBp: 1234 })).toThrow(/IVA/);
    expect(() => checkEntry({ ...base, occurredOn: "10/03/2026" })).toThrow(/Data/);
    expect(() => checkEntry({ ...base, kind: "other" })).toThrow(ErpError);
  });
  it("copies the supplier name so the row survives deleting the supplier", async () => {
    const [s] = await db.insert(suppliers).values({ name: "Papereria SL", taxId: "B123" }).returning();
    const id = await saveEntry(null, { ...base, supplierId: s.id }, uid);
    await db.delete(suppliers).where(eq(suppliers.id, s.id));
    const [e] = await db.select().from(erpEntries).where(eq(erpEntries.id, id));
    expect([e.counterparty, e.supplierId]).toEqual(["Papereria SL", null]);
  });
  it("voided rows disappear from lists and totals; mark paid; edit", async () => {
    const a = await saveEntry(null, { ...base }, uid), b = await saveEntry(null, { ...base, description: "Tinta", base: "50" }, uid);
    expect((await listEntries({ kind: "expense" })).sums.base).toBe(15000);
    await voidEntry(b);
    expect((await listEntries({ kind: "expense" })).sums).toEqual({ base: 10000, vat: 2100, total: 12100 });
    await markPaid(a, "2026-04-01", "Transferència");
    expect((await listEntries({ status: "paid" })).total).toBe(1);
    await expect(markPaid(a, "xx")).rejects.toThrow(ErpError);
    await saveEntry(a, { ...base, base: "200" }, uid);
    expect((await listEntries({})).sums.total).toBe(24200);
  });
  it("filters by text (accent-insensitive), dates, status and cost center; a bad filter value is ignored", async () => {
    const [cc] = await db.insert(costCenters).values({ kind: "course", name: "Curs Packaging" }).returning();
    await saveEntry(null, { ...base, description: "Formació d'impressió", costCenterId: cc.id, dueOn: "2020-01-01" }, uid);
    await saveEntry(null, { ...base, description: "Altra", occurredOn: "2025-01-01" }, uid);
    expect((await listEntries({ q: "impressio" })).total).toBe(1);
    expect((await listEntries({ from: "2026-01-01" })).total).toBe(1);
    expect((await listEntries({ costCenter: cc.id })).total).toBe(1);
    expect((await listEntries({ status: "overdue" })).total).toBe(1);
    expect((await listEntries({ costCenter: "not-a-uuid", from: "garbage" })).total).toBe(2);
  });
  it("CSV: Sage account on the line, plain numbers, text protected against formulas", async () => {
    const [cat] = await db.insert(erpCategories).values({ kind: "expense", name: "Formació", sageAccount: "629000" }).returning();
    await saveEntry(null, { ...base, description: "=HYPERLINK(\"http://evil\")", categoryId: cat.id, base: "-12,50" }, uid);
    const csv = toCsv((await listEntries({}, { all: true })).rows);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("629000");
    expect(csv).toContain(";-12,50;21;-2,63;-15,13;"); // negative amounts are not mangled (-12.50 + -2.625 -> half up on magnitude)
  });
});

describe("subscriptions", () => {
  it("renewing registers the expense and moves the renewal date by the period", async () => {
    const [s] = await db.insert(subscriptions).values({ name: "Adobe", amountCents: 6000, period: "annual", nextRenewal: "2026-03-15" }).returning();
    await renewSubscription(s.id, uid);
    const [after] = await db.select().from(subscriptions);
    expect(after.nextRenewal).toBe("2027-03-15");
    const e = (await db.select().from(erpEntries))[0];
    expect([e.kind, e.description, e.totalCents, e.occurredOn, e.subscriptionId]).toEqual(["expense", "Adobe", 6000, "2026-03-15", s.id]);
    expect((await summary(2026)).renewals).toHaveLength(0);
  });
});

describe("member fees", () => {
  it("period ranges", () => {
    expect(periodRange("2026")).toMatchObject({ start: "2026-01-01", end: "2026-12-31", kind: "annual" });
    expect(periodRange("2026-T2")).toMatchObject({ start: "2026-04-01", end: "2026-06-30", kind: "quarterly" });
    expect(periodRange("2026-T5")).toBeNull();
  });
  it("preview and bulk generation: right members, right amounts, once per period", async () => {
    const [gold] = await db.insert(feeTiers).values({ name: "Or", annualCents: 100000, vatBp: 0 }).returning();
    const [small] = await db.insert(feeTiers).values({ name: "Petita", annualCents: 12000, quarterlyCents: 3500, vatBp: 2100 }).returning();
    await db.insert(members).values([
      { name: "A anual", tierId: gold.id, billingPeriod: "annual" },
      { name: "B trimestral", tierId: small.id, billingPeriod: "quarterly" },
      { name: "C sense tram", billingPeriod: "annual" },
      { name: "D baixa", tierId: gold.id, status: "left" },
      { name: "E futur", tierId: gold.id, joinedOn: "2027-02-01" },
      { name: "F marxa abans", tierId: gold.id, leftOn: "2025-12-31" },
      { name: "G trim sense preu", tierId: gold.id, billingPeriod: "quarterly" },
    ]);
    const annual = await feePreview("2026");
    expect(annual.items.map((i) => i.member.name)).toEqual(["A anual"]);
    const q1 = await feePreview("2026-T1");
    expect(q1.items.map((i) => [i.member.name, i.base, i.vat])).toEqual([["B trimestral", 3500, 735], ["G trim sense preu", 25000, 0]]); // no quarterly price -> annual / 4
    expect(await generateFees("2026", uid)).toBe(1);
    expect(await generateFees("2026", uid)).toBe(0); // a second click creates nothing
    expect(await generateFees("2026-T1", uid)).toBe(2);
    const fees = await listEntries({ kind: "income" });
    expect(fees.total).toBe(3);
    expect(fees.rows.every((r) => r.e.paidOn === null && r.e.feePeriod !== "" && r.category === "Quotes de socis")).toBe(true);
    await expect(feePreview("20x6")).rejects.toThrow(ErpError);
  });
  it("deleting a member keeps their fee entries", async () => {
    const [t] = await db.insert(feeTiers).values({ name: "T", annualCents: 100 }).returning();
    await db.insert(members).values({ name: "Gremi SL", tierId: t.id });
    await generateFees("2026", uid);
    await db.delete(members);
    const e = (await db.select().from(erpEntries))[0];
    expect([e.counterparty, e.memberId]).toEqual(["Gremi SL", null]);
  });
});
