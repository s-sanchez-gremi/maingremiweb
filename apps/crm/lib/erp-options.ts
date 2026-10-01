// Choices for the ERP entry form's pickers (suppliers, categories, cost centers, members, users).
import { asc } from "drizzle-orm";
import { db } from "@apex/db";
import { costCenters, erpCategories, feeTiers, suppliers, users } from "@apex/db/schema";

export type Options = Record<string, { value: string; label: string }[]>;
/** Choices for the select fields that point at other lists. */
export async function loadOptions(): Promise<Options> {
  const [s, c, cc, ti, u] = await Promise.all([
    db.select({ id: suppliers.id, n: suppliers.name }).from(suppliers).orderBy(asc(suppliers.name)),
    db.select({ id: erpCategories.id, n: erpCategories.name, k: erpCategories.kind }).from(erpCategories).orderBy(asc(erpCategories.name)),
    db.select({ id: costCenters.id, n: costCenters.name }).from(costCenters).orderBy(asc(costCenters.name)),
    db.select({ id: feeTiers.id, n: feeTiers.name }).from(feeTiers).orderBy(asc(feeTiers.name)),
    db.select({ id: users.id, n: users.email }).from(users).orderBy(asc(users.email)),
  ]);
  return {
    suppliers: s.map((x) => ({ value: x.id, label: x.n })), "categories-expense": c.filter((x) => x.k === "expense").map((x) => ({ value: x.id, label: x.n })),
    categories: c.map((x) => ({ value: x.id, label: x.n })), "cost-centers": cc.map((x) => ({ value: x.id, label: x.n })),
    tiers: ti.map((x) => ({ value: x.id, label: x.n })), users: u.map((x) => ({ value: x.id, label: x.n })),
  };
}
