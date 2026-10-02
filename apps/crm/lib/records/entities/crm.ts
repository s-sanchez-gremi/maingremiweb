// Companies (the Notion "Empreses": member and non-member companies, backed by the `clients` table so projects and the
// portal keep working) and People (their staff and contacts). Both live in the workspace, not in the admin menu.
import { clients, people } from "@apex/db/schema";
import type { Entity } from "../entity";
import type { Field } from "../fieldTypes";

const f = (name: string, label: string, type: Field["type"], extra: Partial<Field> = {}): Field => ({ name, label, type, ...extra });
const base = { perm: "leads:write", crumb: "CRM" } as const;

export const crmEntities: Entity[] = [
  {
    ...base, key: "companies", title: "Empreses", table: clients, basePath: "/workspace/companies", detail: true, archivable: true,
    search: ["name", "taxId", "customerNumber", "email", "emailBilling", "city", "province", "activity"],
    fields: [
      f("name", "Nom", "text", { required: true }),
      f("memberStatus", "Estat", "select", { filter: true, choices: [["member", "Agremiada"], ["former", "Exagremiada"], ["prospect", "No agremiada"]] }),
      f("feeStatus", "Quota", "select", { filter: true, choices: [["paid", "Al corrent"], ["overdue", "Impagament"], ["unknown", "Sense dades"]] }),
      f("taxId", "NIF/CIF", "text"), f("customerNumber", "Núm. de client", "text"),
      f("email", "Correu", "email"), f("emailBilling", "Correu de notificacions", "email"), f("emailOther", "Correu de newsletter", "email"),
      f("phone", "Telèfon", "phone"), f("phoneOther", "Altre telèfon", "phone"), f("website", "Web", "url"),
      f("address", "Adreça", "text"), f("postalCode", "Codi postal", "text"), f("city", "Població", "text"), f("province", "Província", "text", { filter: true }),
      f("activity", "Activitat", "text", { filter: true }), f("services", "Serveis", "textarea", { wide: true }),
      f("employees", "Empleats", "number"), f("foundedYear", "Any de fundació", "number"),
      f("getsMagazine", "Rep la revista", "checkbox", { filter: true }),
      f("parentCompanyId", "Empresa matriu", "relation", { to: "companies" }),
      f("notes", "Notes", "textarea", { wide: true }),
    ],
    links: (id) => [{ href: `/admin/clients/${id}`, label: "Projectes i accés al portal →" }],
    views: [
      { key: "member", label: "Agremiades", filters: { memberStatus: "member" } },
      { key: "former", label: "Exagremiades", filters: { memberStatus: "former" } },
      { key: "prospect", label: "No agremiades", filters: { memberStatus: "prospect" } },
      { key: "overdue", label: "Impagaments", filters: { feeStatus: "overdue" } },
      { key: "no-taxid", label: "Sense CIF", missing: ["taxId"] },
      { key: "no-email", label: "Sense correu", missing: ["email"] },
      { key: "self-employed", label: "Autònoms", match: { taxId: "[A-Za-z]$" } }, // tax id ending in a letter (a personal NIF), as in Notion's AUTONOMS view
    ],
    groupBy: ["memberStatus", "feeStatus", "province", "activity"],
    defaultColumns: ["name", "memberStatus", "feeStatus", "place", "contact", "people", "lastVisit", "tier"],
    columnSets: [
      { label: "Resum", keys: ["name", "memberStatus", "feeStatus", "place", "contact", "people", "lastVisit", "tier"] },
      { label: "Empresa", keys: ["name", "memberStatus", "feeStatus", "taxId", "customerNumber", "activity", "employees", "foundedYear", "tier", "getsMagazine"] },
      { label: "Adreça", keys: ["name", "taxId", "address", "postalCode", "city", "province", "getsMagazine"] },
      { label: "Correu i telèfon", keys: ["name", "memberStatus", "email", "emailBilling", "emailOther", "phone", "phoneOther", "website"] },
    ],
    subline: (r) => (r.taxId || r.activity ? { text: [r.taxId, r.activity].filter(Boolean).join(" · ") } : { text: "Falta CIF", warn: true }),
    headline: { sub: (r) => [r.taxId, [r.city, r.province].filter(Boolean).join(", "), r.activity].filter(Boolean).join(" · "), status: "memberStatus" },
    bulk: { invite: true },
    summary: (r) => `${r.name}${r.taxId ? ` · ${r.taxId}` : ""}`,
    hint: "Una empresa per NIF/CIF: si ja existeix, no se'n pot crear una altra. Els socis, contactes, projectes i notes hi queden enllaçats.",
  },
  {
    ...base, key: "people", title: "Persones", table: people, basePath: "/workspace/people", detail: true, archivable: true,
    search: ["name", "email", "phone", "role"],
    fields: [
      f("name", "Nom", "text", { required: true }), f("role", "Càrrec", "text"), f("companyId", "Empresa", "relation", { to: "companies", filter: true }),
      f("email", "Correu", "email"), f("phone", "Telèfon", "phone"), f("source", "Origen", "text"), f("notes", "Notes", "textarea", { wide: true }),
    ],
    summary: (r) => `${r.name}${r.role ? ` · ${r.role}` : ""}`,
    bulk: { invite: true },
  },
];
