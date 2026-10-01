// An entity definition: everything the engine needs to give a table its list, edit form, search, filters, sorting and CSV.
// Definitions live in code (lib/records/entities/*) and are reviewed in pull requests; there is no "create a database" UI.
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type { Field } from "./fieldTypes";

export type Entity = {
  key: string;               // URL segment and relation target
  title: string;             // plural, shown as the page title
  table: AnyPgTable;
  fields: Field[];
  basePath: string;          // where the screens live, e.g. /admin/erp/suppliers
  crumb: string;
  perm: "erp:write" | "leads:write" | "projects:write";
  search?: string[];         // text columns searched by the list box
  sort?: string;             // default sort column (default "name")
  label?: string;            // column used when another record points here (default "name")
  summary: (r: Record<string, unknown>) => string;
  hint?: string;
  detail?: boolean;          // record page with notes, files, history and linked records ({basePath}/{id})
  archivable?: boolean;      // table has `archivedAt`: records are archived and restored instead of only deleted
  links?: (id: string) => { href: string; label: string }[]; // extra links on the record page (e.g. projects and portal access)
  hidden?: boolean;          // lookup-only (users): no screens
};
