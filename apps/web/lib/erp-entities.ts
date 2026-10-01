// The simple ERP lists (suppliers, categories, cost centers, fee tiers, members, subscriptions) are driven by this config:
// one generic screen and one generic save action, so adding a list = adding an entry here (see CLAUDE.md "generic entity screens").
import { asc } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { db } from "@apex/db";
import { costCenters, erpCategories, feeTiers, members, subscriptions, suppliers, users } from "@apex/db/schema";

export type FieldSpec = {
  name: string; label: string; wide?: boolean; required?: boolean;
  kind: "text" | "email" | "date" | "euros" | "percent" | "select" | "checkbox" | "textarea";
  options?: "suppliers" | "categories-expense" | "cost-centers" | "tiers" | "users" | readonly (readonly [string, string])[];
};
export type EntityConfig = { key: string; title: string; table: AnyPgTable; fields: FieldSpec[]; search?: string[]; summary: (r: Record<string, unknown>) => string; hint?: string };

const YES_NO_KIND = (opts: readonly (readonly [string, string])[]) => opts;
const t = (name: string, label: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({ name, label, kind: "text", ...extra });

export const ENTITIES: Record<string, EntityConfig> = {
  suppliers: {
    key: "suppliers", title: "Proveïdors", table: suppliers, search: ["name", "taxId", "email"],
    fields: [t("name", "Nom", { required: true }), t("taxId", "NIF/CIF"), { name: "email", label: "Correu", kind: "email" }, t("phone", "Telèfon"), { name: "notes", label: "Notes", kind: "textarea", wide: true }],
    summary: (r) => `${r.name}${r.taxId ? ` · ${r.taxId}` : ""}`,
  },
  categories: {
    key: "categories", title: "Categories", table: erpCategories,
    fields: [
      { name: "kind", label: "Tipus", kind: "select", required: true, options: YES_NO_KIND([["expense", "Despesa"], ["income", "Ingrés"]]) },
      t("name", "Nom", { required: true }), t("sageAccount", "Compte de Sage (p. ex. 629000)"), { name: "active", label: "Activa", kind: "checkbox" },
    ],
    summary: (r) => `${r.kind === "income" ? "Ingrés" : "Despesa"} · ${r.name}${r.sageAccount ? ` (${r.sageAccount})` : ""}`,
    hint: "El compte de Sage surt a l'exportació perquè la gestoria no hagi de classificar res a mà.",
  },
  "cost-centers": {
    key: "cost-centers", title: "Centres de cost", table: costCenters,
    fields: [
      { name: "kind", label: "Tipus", kind: "select", required: true, options: YES_NO_KIND([["course", "Curs"], ["project", "Projecte"], ["general", "General"]]) },
      t("name", "Nom", { required: true }), { name: "startsOn", label: "Inici", kind: "date" }, { name: "endsOn", label: "Fi", kind: "date" },
      { name: "budgetCents", label: "Pressupost (€)", kind: "euros" }, { name: "active", label: "Actiu", kind: "checkbox" },
    ],
    summary: (r) => `${r.kind === "course" ? "Curs" : r.kind === "project" ? "Projecte" : "General"} · ${r.name}`,
    hint: "Cada despesa o ingrés pot anar a un centre de cost (un curs, un projecte o «general»): així es veu quant costa i quant ingressa cada curs.",
  },
  "fee-tiers": {
    key: "fee-tiers", title: "Trams de quota", table: feeTiers,
    fields: [
      t("name", "Nom del tram", { required: true }), { name: "annualCents", label: "Quota anual (€)", kind: "euros", required: true },
      { name: "quarterlyCents", label: "Quota trimestral (€, buit = anual / 4)", kind: "euros" }, { name: "vatBp", label: "IVA de la quota (%)", kind: "percent" }, { name: "active", label: "Actiu", kind: "checkbox" },
    ],
    summary: (r) => `${r.name}`,
    hint: "L'IVA de les quotes l'ha de confirmar l'assessor (per defecte 0 %).",
  },
  members: {
    key: "members", title: "Socis", table: members, search: ["name", "taxId", "email"],
    fields: [
      t("name", "Empresa / nom", { required: true }), t("taxId", "NIF/CIF"), { name: "email", label: "Correu", kind: "email" }, t("phone", "Telèfon"),
      { name: "status", label: "Estat", kind: "select", options: YES_NO_KIND([["active", "Actiu"], ["left", "Baixa"]]) },
      { name: "tierId", label: "Tram de quota", kind: "select", options: "tiers" },
      { name: "billingPeriod", label: "Facturació", kind: "select", options: YES_NO_KIND([["annual", "Anual"], ["quarterly", "Trimestral"]]) },
      { name: "joinedOn", label: "Alta", kind: "date" }, { name: "leftOn", label: "Baixa", kind: "date" }, { name: "notes", label: "Notes", kind: "textarea", wide: true },
    ],
    summary: (r) => `${r.name}${r.status === "left" ? " (baixa)" : ""}`,
  },
  subscriptions: {
    key: "subscriptions", title: "Subscripcions", table: subscriptions,
    fields: [
      t("name", "Nom", { required: true }), { name: "supplierId", label: "Proveïdor", kind: "select", options: "suppliers" },
      { name: "amountCents", label: "Import (€)", kind: "euros", required: true },
      { name: "period", label: "Periodicitat", kind: "select", options: YES_NO_KIND([["monthly", "Mensual"], ["quarterly", "Trimestral"], ["annual", "Anual"]]) },
      { name: "nextRenewal", label: "Propera renovació", kind: "date" }, { name: "categoryId", label: "Categoria", kind: "select", options: "categories-expense" },
      { name: "costCenterId", label: "Centre de cost", kind: "select", options: "cost-centers" }, { name: "ownerId", label: "Responsable", kind: "select", options: "users" },
      { name: "active", label: "Activa", kind: "checkbox" }, { name: "notes", label: "Notes", kind: "textarea", wide: true },
    ],
    summary: (r) => `${r.name}`,
    hint: "Quan arriba la factura, «Registra la renovació» crea la despesa i mou la data de renovació.",
  },
};

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
