// The ERP registry's simple lists as engine definitions (they live in the workspace; /admin/erp/<list> redirects there) (suppliers, categories, cost centers, fee tiers, members, subscriptions).
import { costCenters, erpCategories, feeTiers, members, subscriptions, suppliers, users } from "@apex/db/schema";
import type { Entity } from "../entity";
import type { Field } from "../fieldTypes";

const f = (name: string, label: string, type: Field["type"], extra: Partial<Field> = {}): Field => ({ name, label, type, ...extra });
const base = { perm: "erp:write", crumb: "Gestió" } as const;
const at = (key: string) => `/workspace/${key}`;

export const erpEntities: Entity[] = [
  {
    ...base, key: "suppliers", title: "Proveïdors", table: suppliers, basePath: at("suppliers"), detail: true, archivable: true, search: ["name", "taxId", "email"],
    fields: [f("name", "Nom", "text", { required: true }), f("taxId", "NIF/CIF", "text"), f("email", "Correu", "email"), f("phone", "Telèfon", "phone"), f("notes", "Notes", "textarea", { wide: true })],
    summary: (r) => `${r.name}${r.taxId ? ` · ${r.taxId}` : ""}`,
  },
  {
    ...base, key: "categories", title: "Categories", table: erpCategories, basePath: at("categories"), sort: "name",
    fields: [
      f("kind", "Tipus", "select", { required: true, filter: true, choices: [["expense", "Despesa"], ["income", "Ingrés"]] }),
      f("name", "Nom", "text", { required: true }), f("sageAccount", "Compte de Sage (p. ex. 629000)", "text"), f("active", "Activa", "checkbox", { filter: true }),
    ],
    summary: (r) => `${r.kind === "income" ? "Ingrés" : "Despesa"} · ${r.name}${r.sageAccount ? ` (${r.sageAccount})` : ""}`,
    hint: "El compte de Sage surt a l'exportació perquè la gestoria no hagi de classificar res a mà.",
  },
  {
    ...base, key: "cost-centers", title: "Centres de cost", table: costCenters, basePath: at("cost-centers"),
    fields: [
      f("kind", "Tipus", "select", { required: true, filter: true, choices: [["course", "Curs"], ["project", "Projecte"], ["general", "General"]] }),
      f("name", "Nom", "text", { required: true }), f("startsOn", "Inici", "date"), f("endsOn", "Fi", "date"),
      f("budgetCents", "Pressupost (€)", "money"), f("active", "Actiu", "checkbox", { filter: true }),
    ],
    summary: (r) => `${r.kind === "course" ? "Curs" : r.kind === "project" ? "Projecte" : "General"} · ${r.name}`,
    hint: "Cada despesa o ingrés pot anar a un centre de cost (un curs, un projecte o «general»): així es veu quant costa i quant ingressa cada curs.",
  },
  {
    ...base, key: "fee-tiers", title: "Trams de quota", table: feeTiers, basePath: at("fee-tiers"),
    fields: [
      f("name", "Nom del tram", "text", { required: true }), f("annualCents", "Quota anual (€)", "money", { required: true }),
      f("quarterlyCents", "Quota trimestral (€, buit = anual / 4)", "money"), f("vatBp", "IVA de la quota (%)", "percent"), f("active", "Actiu", "checkbox", { filter: true }),
    ],
    summary: (r) => `${r.name}`,
    hint: "L'IVA de les quotes l'ha de confirmar l'assessor (per defecte 0 %).",
  },
  {
    ...base, key: "members", title: "Socis", table: members, basePath: at("members"), detail: true, archivable: true, search: ["name", "taxId", "email"],
    fields: [
      f("name", "Empresa / nom", "text", { required: true }), f("taxId", "NIF/CIF", "text"), f("email", "Correu", "email"), f("phone", "Telèfon", "phone"),
      f("status", "Estat", "select", { filter: true, choices: [["active", "Actiu"], ["left", "Baixa"]] }),
      f("companyId", "Empresa", "relation", { to: "companies" }),
      f("tierId", "Tram de quota", "relation", { to: "fee-tiers", filter: true }),
      f("billingPeriod", "Facturació", "select", { filter: true, choices: [["annual", "Anual"], ["quarterly", "Trimestral"]] }),
      f("joinedOn", "Alta", "date"), f("leftOn", "Baixa", "date"), f("notes", "Notes", "textarea", { wide: true }),
    ],
    summary: (r) => `${r.name}${r.status === "left" ? " (baixa)" : ""}`,
  },
  {
    ...base, key: "subscriptions", title: "Subscripcions", table: subscriptions, basePath: at("subscriptions"),
    fields: [
      f("name", "Nom", "text", { required: true }), f("supplierId", "Proveïdor", "relation", { to: "suppliers", filter: true }),
      f("amountCents", "Import (€)", "money", { required: true }),
      f("period", "Periodicitat", "select", { filter: true, choices: [["monthly", "Mensual"], ["quarterly", "Trimestral"], ["annual", "Anual"]] }),
      f("nextRenewal", "Propera renovació", "date"), f("categoryId", "Categoria", "relation", { to: "categories", where: { kind: "expense" } }),
      f("costCenterId", "Centre de cost", "relation", { to: "cost-centers" }), f("ownerId", "Responsable", "relation", { to: "users" }),
      f("active", "Activa", "checkbox", { filter: true }), f("notes", "Notes", "textarea", { wide: true }),
    ],
    summary: (r) => `${r.name}`,
    hint: "Quan arriba la factura, «Registra la renovació» crea la despesa i mou la data de renovació.",
  },
  // Lookup-only: lets "Responsable" point at a staff user (no screens).
  { ...base, key: "users", title: "Usuaris", table: users, basePath: "", label: "email", fields: [], summary: (r) => String(r.email), hidden: true },
];
