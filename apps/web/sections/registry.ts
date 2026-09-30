// The single source of truth for section types. To add a type: add one entry here
// (and its renderer in sections/render.tsx). Validation and the admin form are generated.
import { z } from "zod";
import { shape, type Field } from "./fields";

export type SectionDef = { name: string; label: string; fields: Field[] };

const link: Field[] = [
  { name: "linkLabel", label: "Text de l'enllaç", kind: "text" },
  { name: "linkUrl", label: "Enllaç", kind: "link" },
];

export const sectionDefs = [
  { name: "header", label: "Capçalera", fields: [
    { name: "title", label: "Títol", kind: "text", required: true },
    { name: "subtitle", label: "Subtítol", kind: "text" },
    { name: "image", label: "Imatge", kind: "image" },
  ] },
  { name: "text", label: "Text", fields: [
    // Body allows only: paragraphs, **bold**, *italic*, [link](url), "- " lists.
    { name: "body", label: "Text", kind: "textarea", required: true },
  ] },
  { name: "image", label: "Imatge", fields: [
    { name: "image", label: "Imatge", kind: "image", required: true },
    { name: "caption", label: "Peu de foto", kind: "text" },
  ] },
  { name: "embed", label: "Vídeo / Adobe", fields: [
    { name: "url", label: "Enllaç (YouTube o Adobe)", kind: "embed", required: true },
  ] },
  { name: "form", label: "Formulari", fields: [
    { name: "formId", label: "Formulari", kind: "form", required: true },
  ] },
  { name: "cta", label: "Crida a l'acció", fields: [
    { name: "heading", label: "Títol", kind: "text", required: true },
    { name: "text", label: "Text", kind: "textarea" },
    ...link,
  ] },
  { name: "tileRow", label: "Fila de destacats", fields: [
    { name: "tiles", label: "Destacats", kind: "list", max: 6, fields: [
      { name: "label", label: "Etiqueta", kind: "text", required: true },
      { name: "text", label: "Text", kind: "text" },
    ] },
  ] },
  { name: "latestPosts", label: "Últimes notícies (automàtic)", fields: [
    { name: "heading", label: "Títol", kind: "text" },
    { name: "count", label: "Quantes", kind: "select", options: [{ value: "3", label: "3" }, { value: "6", label: "6" }, { value: "9", label: "9" }] },
  ] },
  { name: "cardGrid", label: "Graella de targetes", fields: [
    { name: "heading", label: "Títol", kind: "text" },
    { name: "cards", label: "Targetes", kind: "list", max: 12, fields: [
      { name: "title", label: "Títol", kind: "text", required: true },
      { name: "text", label: "Text", kind: "text" },
      { name: "image", label: "Imatge", kind: "image" },
      { name: "linkUrl", label: "Enllaç", kind: "link" },
    ] },
  ] },
] as const satisfies readonly SectionDef[];

export const sectionByName = Object.fromEntries(sectionDefs.map((d) => [d.name, d as SectionDef]));

const variants = sectionDefs.map((d) =>
  z.object({ id: z.string().min(1), type: z.literal(d.name), data: z.object(shape(d.fields as unknown as Field[])) }),
);
export const sectionSchema = z.discriminatedUnion("type", variants as unknown as [(typeof variants)[0], ...typeof variants]);
export const sectionsSchema = z.array(sectionSchema).max(60);
export type Section = z.infer<typeof sectionSchema>;

/** Every media id referenced by a list of sections (walks the field descriptions, so new types work automatically). */
export function collectMediaIds(sections: { type: string; data: Record<string, unknown> }[]): string[] {
  const out = new Set<string>();
  const walk = (fields: Field[], data: Record<string, unknown>) => {
    for (const f of fields) {
      const v = data?.[f.name];
      if (f.kind === "image" && typeof v === "string" && v) out.add(v);
      if (f.kind === "list" && Array.isArray(v)) v.forEach((item) => walk(f.fields, item as Record<string, unknown>));
    }
  };
  for (const s of sections) {
    const def = sectionByName[s.type];
    if (def) walk(def.fields, s.data);
  }
  return [...out];
}
