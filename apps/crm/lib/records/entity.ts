// An entity definition: everything the engine needs to give a table its list, edit form, search, filters, sorting and CSV.
// Definitions live in code (lib/records/entities/*) and are reviewed in pull requests; there is no "create a database" UI.
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type { Field } from "./fieldTypes";

export type EntityView = {
  key: string; label: string;
  filters?: Record<string, string>;  // field = value ("@me" is the signed-in person)
  missing?: string[];                // fields that must be blank
  match?: Record<string, string>;    // field ~ regular expression (fixed in the definition, never from the URL)
};
export type ColumnSet = { label: string; keys: string[] };

export type Entity = {
  key: string;               // URL segment and relation target
  title: string;             // plural, shown as the page title
  table: AnyPgTable;
  fields: Field[];
  basePath: string;          // where the screens live, e.g. /admin/erp/suppliers
  crumb: string;
  perm: "erp:write" | "leads:write" | "projects:write";
  search?: string[];         // text columns searched by the list box
  sortDir?: "asc" | "desc"; // default direction of `sort` (dates: newest first)
  noHistory?: boolean;        // plain link rows (e.g. attendance): no change history
  sort?: string;             // default sort column (default "name")
  label?: string;            // column used when another record points here (default "name")
  summary: (r: Record<string, unknown>) => string;
  hint?: string;
  views?: EntityView[];      // workspace tabs with counts above the table ("Agremiades", "Sense CIF"…); the first tab is always "all"
  groupBy?: string[];        // fields the table can be grouped by (default: its select fields)
  columnSets?: ColumnSet[];  // one-click column presets in the Columnes menu (like Notion's "Adreça" or "Correu electrònic" views)
  defaultColumns?: string[]; // workspace table: columns shown by default (field names and computed columns); the person can change it
  subline?: (r: Record<string, unknown>) => { text: string; warn?: boolean } | null; // small line under the name in the table
  headline?: { sub: (r: Record<string, unknown>) => string; status?: string };       // record sheet header: subtitle and the status field
  bulk?: { invite?: boolean }; // extra bulk action on selected rows: invite them to an event
  logo?: string;             // column holding the key of the record's logo image: shown instead of the monogram (route {basePath}/{id}/logo)
  boardTitle?: string[];     // board view: fields tried in order for a card's title (the first with a value); default is `summary`
  detail?: boolean;          // record page with notes, files, history and linked records ({basePath}/{id})
  archivable?: boolean;      // table has `archivedAt`: records are archived and restored instead of only deleted
  links?: (id: string) => { href: string; label: string }[]; // extra links on the record page (e.g. projects and portal access)
  hidden?: boolean;          // lookup-only (users): no screens
};
