// Blocks: the small pieces placed inside the columns of a "Columnes" section (visual page builder).
// Same field language as sections, so validation and the admin form are generated. Add a block = one entry here
// + its renderer in sections/render.tsx. Looks always come from the design tokens; editors never pick colours or fonts.
import type { BlockDef, Field } from "@apex/core/fields";

export type { BlockDef };

export const blockDefs = [
  { name: "heading", label: "Títol", fields: [
    { name: "text", label: "Títol", kind: "text", required: true },
    { name: "size", label: "Mida", kind: "select", options: [{ value: "m", label: "Mitjà" }, { value: "l", label: "Gran" }, { value: "s", label: "Petit" }] },
  ] },
  { name: "text", label: "Text", fields: [
    // Same safe formatting as the Text section: paragraphs, **bold**, *italic*, [link](url), "- " lists.
    { name: "body", label: "Text", kind: "textarea", required: true },
  ] },
  { name: "image", label: "Imatge", fields: [
    { name: "image", label: "Imatge", kind: "image", required: true },
    { name: "caption", label: "Peu de foto", kind: "text" },
  ] },
  { name: "button", label: "Botó", fields: [
    { name: "label", label: "Text del botó", kind: "text", required: true },
    { name: "url", label: "Enllaç", kind: "link", required: true },
    { name: "variant", label: "Estil", kind: "select", options: [{ value: "primary", label: "Vermell" }, { value: "outline", label: "Contorn" }] },
  ] },
  { name: "embed", label: "Vídeo / Adobe", fields: [
    { name: "url", label: "Enllaç (YouTube o Adobe)", kind: "embed", required: true },
  ] },
  { name: "card", label: "Targeta", fields: [
    { name: "label", label: "Etiqueta", kind: "text" },
    { name: "title", label: "Títol", kind: "text", required: true },
    { name: "text", label: "Text", kind: "text" },
    { name: "image", label: "Imatge", kind: "image" },
    { name: "linkUrl", label: "Enllaç", kind: "link" },
  ] },
] as const satisfies readonly BlockDef[];

export const blockByName: Record<string, BlockDef> = Object.fromEntries(blockDefs.map((d) => [d.name, d as BlockDef]));

/** Column layouts of the "Columnes" section: value = relative widths. */
export const layouts = [
  { value: "1-1", label: "2 columnes iguals", cols: 2 },
  { value: "1-1-1", label: "3 columnes", cols: 3 },
  { value: "1-1-1-1", label: "4 columnes", cols: 4 },
  { value: "2-1", label: "2 columnes (ampla + estreta)", cols: 2 },
  { value: "1-2", label: "2 columnes (estreta + ampla)", cols: 2 },
  { value: "1", label: "1 columna", cols: 1 },
] as const;
export const COLUMN_FIELDS = ["c1", "c2", "c3", "c4"] as const;
export const columnCount = (layout: unknown) => layouts.find((l) => l.value === layout)?.cols ?? 2;

/** Brand-only style choices any section (except the page header) can take. Nothing else is configurable. */
export const styleFields: Field[] = [
  { name: "bg", label: "Fons", kind: "select", options: [
    { value: "auto", label: "Per defecte" }, { value: "ivory", label: "Crema" }, { value: "beige", label: "Beix" },
    { value: "white", label: "Blanc" }, { value: "dark", label: "Negre" }, { value: "red", label: "Vermell GREMI" },
  ] },
  { name: "space", label: "Espai a dalt i a baix", kind: "select", options: [
    { value: "m", label: "Normal" }, { value: "s", label: "Petit" }, { value: "l", label: "Gran" }, { value: "none", label: "Cap" },
  ] },
  { name: "align", label: "Alineació del text", kind: "select", options: [{ value: "left", label: "Esquerra" }, { value: "center", label: "Centre" }] },
];
