// The registry of form field types. To add one: add an entry here (config fields) and its check in validate.ts,
// and its input in components/site/form/Inputs.tsx. The builder UI and the stored-data validation are generated.
import { z } from "zod";
import { shape, type Field } from "@/sections/fields";

const yesNo = [{ value: "no", label: "No" }, { value: "yes", label: "Sí" }];
const common: Field[] = [
  { name: "label", label: "Pregunta / etiqueta", kind: "ltext", required: true },
  { name: "help", label: "Text d'ajuda (opcional)", kind: "ltext" },
  { name: "required", label: "Obligatori", kind: "select", options: yesNo },
];
const logic: Field[] = [
  { name: "showField", label: "Mostra només si… (un camp anterior)", kind: "fieldref" },
  { name: "showOp", label: "Condició", kind: "select", options: [{ value: "equals", label: "és igual a" }, { value: "not_equals", label: "no és igual a" }] },
  { name: "showValue", label: "Valor (per a caselles: yes / no)", kind: "text" },
];
const mapField: Field = {
  name: "map", label: "Guarda-ho al contacte com a", kind: "select",
  options: [{ value: "", label: "— res —" }, { value: "name", label: "Nom" }, { value: "email", label: "Correu" }, { value: "phone", label: "Telèfon" }, { value: "company", label: "Empresa" }],
};
const optionsField: Field = { name: "options", label: "Opcions", kind: "list", max: 30, fields: [{ name: "label", label: "Opció", kind: "ltext", required: true }] };

export type FormTypeDef = { name: string; label: string; fields: Field[]; input: boolean };

export const formTypeDefs: readonly FormTypeDef[] = [
  { name: "text", label: "Text curt", input: true, fields: [...common, mapField, ...logic] },
  { name: "textarea", label: "Text llarg", input: true, fields: [...common, ...logic] },
  { name: "email", label: "Correu", input: true, fields: [...common, mapField, ...logic] },
  { name: "phone", label: "Telèfon", input: true, fields: [...common, mapField, ...logic] },
  { name: "number", label: "Número", input: true, fields: [...common, { name: "min", label: "Mínim (opcional)", kind: "text" }, { name: "max", label: "Màxim (opcional)", kind: "text" }, ...logic] },
  { name: "dropdown", label: "Desplegable", input: true, fields: [...common, optionsField, ...logic] },
  { name: "choice", label: "Opció múltiple", input: true, fields: [...common, { name: "multiple", label: "Es pot triar", kind: "select", options: [{ value: "one", label: "Només una opció" }, { value: "many", label: "Diverses opcions" }] }, optionsField, ...logic] },
  { name: "checkbox", label: "Casella", input: true, fields: [...common, ...logic] },
  { name: "date", label: "Data", input: true, fields: [...common, ...logic] },
  { name: "file", label: "Pujada d'arxiu", input: true, fields: [...common, ...logic] },
  { name: "pagebreak", label: "Salt de pàgina", input: false, fields: [{ name: "title", label: "Títol del pas", kind: "ltext", required: true }] },
];
export const formTypeByName: Record<string, FormTypeDef> = Object.fromEntries(formTypeDefs.map((d) => [d.name, d]));

const variants = formTypeDefs.map((d) => z.object({ id: z.string().min(1), type: z.literal(d.name), data: z.object(shape(d.fields)) }));
export const formItemSchema = z.discriminatedUnion("type", variants as unknown as [(typeof variants)[0], ...typeof variants]);
export const formItemsSchema = z.array(formItemSchema).max(60);

export type LText = Partial<Record<"ca" | "es" | "en", string>>;
export type Item = { id: string; type: string; data: Record<string, unknown> };
export const lt = (v: unknown, locale: string): string => {
  const o = (v ?? {}) as Record<string, string>;
  return (o[locale] ?? "").trim() || (o.ca ?? "").trim();
};
/** The stored value of a dropdown/choice option is its Catalan label (trimmed). */
export const optionValues = (item: Item): string[] =>
  ((item.data.options as { label?: LText }[]) ?? []).map((o) => (o.label?.ca ?? "").trim());
export const isRequired = (item: Item) => item.data.required === "yes";

/** Problems with a form DEFINITION (checked when the form is saved). Returns human-readable messages. */
export function checkDefinition(items: Item[], destination: string, target?: string | null): string[] {
  const issues: string[] = [];
  const seenBefore = new Map<string, Item>();
  const label = (i: Item) => lt(i.data.label ?? i.data.title, "ca") || i.type;
  for (const item of items) {
    const def = formTypeByName[item.type];
    if (!def) { issues.push(`Tipus de camp desconegut: ${item.type}`); continue; }
    if (item.data.showField) {
      const ref = seenBefore.get(String(item.data.showField));
      if (!ref) issues.push(`«${label(item)}»: la condició ha de dependre d'un camp anterior`);
      else if (["dropdown", "choice"].includes(ref.type) && item.data.showValue && !optionValues(ref).includes(String(item.data.showValue)))
        issues.push(`«${label(item)}»: el valor de la condició no és cap opció de «${label(ref)}»`);
      else if (!item.data.showValue) issues.push(`«${label(item)}»: indica el valor de la condició`);
    }
    if (["dropdown", "choice"].includes(item.type)) {
      const vals = optionValues(item);
      if (vals.length < 1) issues.push(`«${label(item)}»: afegeix almenys una opció`);
      if (new Set(vals).size !== vals.length) issues.push(`«${label(item)}»: hi ha opcions repetides`);
    }
    if (item.type === "number") {
      const { min, max } = item.data as { min?: string; max?: string };
      const n = (v?: string) => (v === undefined || v === "" ? null : Number(String(v).replace(",", ".")));
      if ((min && Number.isNaN(n(min))) || (max && Number.isNaN(n(max)))) issues.push(`«${label(item)}»: el mínim i el màxim han de ser números`);
      else if (n(min) !== null && n(max) !== null && n(min)! > n(max)!) issues.push(`«${label(item)}»: el mínim és superior al màxim`);
    }
    if (item.type !== "pagebreak") seenBefore.set(item.id, item);
  }
  const emails = items.filter((i) => i.data.map === "email" || (i.type === "email" && !i.data.map));
  if (emails.filter((i) => i.data.map === "email").length > 1) issues.push("Només un camp pot guardar-se com a correu del contacte");
  if (destination === "project" && !target) issues.push("Tria el projecte o client on s'adjuntaran les respostes");
  if (destination === "crm_lead") {
    const em = items.find((i) => i.data.map === "email");
    if (!em) issues.push("Per crear contactes al CRM cal un camp de correu marcat «Guarda-ho al contacte com a: Correu»");
    else if (!isRequired(em)) issues.push("El camp de correu del contacte ha de ser obligatori");
  }
  return issues;
}
