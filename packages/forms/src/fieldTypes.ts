// The registry of form field types. To add one: add an entry here (config fields) and its check in validate.ts,
// and its input in components/site/form/Inputs.tsx. The builder UI and the stored-data validation are generated.
import { z } from "zod";
import { shape, type Field } from "@apex/core/fields";
import { PREFILL_KEY, PREFILL_TYPES, prefillKeyOf, reservedPrefillKey } from "./prefill-rules";

const yesNo = [{ value: "no", label: "No" }, { value: "yes", label: "Sí" }];
const common: Field[] = [
  { name: "label", label: "Pregunta / etiqueta", kind: "ltext", required: true },
  { name: "help", label: "Text d'ajuda (opcional)", kind: "ltext" },
  { name: "required", label: "Obligatori", kind: "select", options: yesNo },
];
// Show-only-if logic. The first condition keeps the keys forms have always had (showField / showOp / showValue), so every saved form
// works unchanged; "more conditions" (showExtra) and how they combine (showMatch) are optional additions.
export const CONDITION_OPS = ["equals", "not_equals", "contains", "empty", "not_empty"] as const;
export type CondOp = (typeof CONDITION_OPS)[number];
export type Condition = { field: string; op: CondOp; value: string };
export const MAX_EXTRA_CONDITIONS = 5;
const opOptions = [
  { value: "equals", label: "és igual a" }, { value: "not_equals", label: "no és igual a" }, { value: "contains", label: "conté el text" },
  { value: "empty", label: "està buit" }, { value: "not_empty", label: "no està buit" },
];
const conditionFields = (fieldLabel: string, fieldName: string, opName: string, valueName: string): Field[] => [
  { name: fieldName, label: fieldLabel, kind: "fieldref" },
  { name: opName, label: "Condició", kind: "select", options: opOptions },
  { name: valueName, label: "Valor (Sí / No: yes o no; una nota: el número; no s'usa amb «està buit»)", kind: "text" },
];
const logicWith = (firstLabel: string): Field[] => [
  ...conditionFields(firstLabel, "showField", "showOp", "showValue"),
  { name: "showExtra", label: "Més condicions", kind: "list", max: MAX_EXTRA_CONDITIONS, fields: conditionFields("Camp anterior", "field", "op", "value") },
  { name: "showMatch", label: "Si n'hi ha més d'una", kind: "select", options: [{ value: "all", label: "Cal que es compleixin totes" }, { value: "any", label: "Basta que es compleixi una" }] },
];
const logic: Field[] = logicWith("Mostra només si… (un camp anterior)");
const stepLogic: Field[] = logicWith("Mostra aquest pas només si… (un camp d'un pas anterior)");

/** The conditions of a field or step, in order: the original one (when a field is chosen) then the extra ones, and how they combine. */
export function conditionsOf(item: { data: Record<string, unknown> }): { match: "all" | "any"; list: Condition[] } {
  const d = item.data;
  const op = (v: unknown): CondOp => ((CONDITION_OPS as readonly unknown[]).includes(v) ? (v as CondOp) : "equals");
  const list: Condition[] = [];
  if (d.showField) list.push({ field: String(d.showField), op: op(d.showOp), value: String(d.showValue ?? "") });
  if (Array.isArray(d.showExtra)) for (const e of d.showExtra as Record<string, unknown>[]) list.push({ field: String(e?.field ?? ""), op: op(e?.op), value: String(e?.value ?? "") });
  return { match: d.showMatch === "any" ? "any" : "all", list };
}
/** Fields that can be tested with «conté el text» (the others have fixed options or a number: use «és igual a»). */
export const TEXT_LIKE = ["text", "textarea", "email", "phone", "url", "address"];
const mapField: Field = {
  name: "map", label: "Guarda-ho al contacte com a", kind: "select",
  options: [{ value: "", label: "— res —" }, { value: "name", label: "Nom" }, { value: "email", label: "Correu" }, { value: "phone", label: "Telèfon" }, { value: "company", label: "Empresa" }],
};
const optionsField: Field = { name: "options", label: "Opcions", kind: "list", max: 30, fields: [{ name: "label", label: "Opció", kind: "ltext", required: true }] };

export type FormTypeDef = { name: string; label: string; fields: Field[]; input: boolean };

const prefillField: Field = { name: "prefill", label: "Nom a l'enllaç per omplir-lo (opcional: lletres minúscules, xifres, - o _; per exemple «empresa» omple el camp amb /formulari?empresa=Nom)", kind: "text" };
const withPrefill = (d: FormTypeDef): FormTypeDef => (PREFILL_TYPES.includes(d.name) ? { ...d, fields: [...d.fields.slice(0, common.length), prefillField, ...d.fields.slice(common.length)] } : d); // right after label, help and required

const baseDefs: readonly FormTypeDef[] = [
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
  { name: "rating", label: "Valoració (estrelles / nota)", input: true, fields: [...common,
      { name: "max", label: "Escala", kind: "select", options: [{ value: "5", label: "De 1 a 5" }, { value: "10", label: "De 1 a 10" }] },
      { name: "lowLabel", label: "Text de l'extrem baix (opcional)", kind: "ltext" }, { name: "highLabel", label: "Text de l'extrem alt (opcional)", kind: "ltext" }, ...logic] },
  { name: "yesno", label: "Sí / No", input: true, fields: [...common, ...logic] },
  { name: "url", label: "Enllaç web (URL)", input: true, fields: [...common, ...logic] },
  { name: "address", label: "Adreça (carrer, codi postal, població)", input: true, fields: [...common, ...logic] },
  { name: "heading", label: "Títol (només text, sense resposta)", input: false, fields: [{ name: "title", label: "Títol", kind: "ltext", required: true }, ...logic] },
  { name: "paragraph", label: "Paràgraf (només text, sense resposta)", input: false, fields: [{ name: "body", label: "Text (admet **negreta**, *cursiva*, [text](enllaç) i llistes amb «- »)", kind: "ltextarea", required: true }, ...logic] },
  { name: "pagebreak", label: "Salt de pàgina", input: false, fields: [{ name: "title", label: "Títol del pas", kind: "ltext", required: true }, ...stepLogic] },
];
export const formTypeDefs: readonly FormTypeDef[] = baseDefs.map(withPrefill);
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
/** The highest mark of a rating field (1 to 5 by default, or 1 to 10). */
export const ratingMax = (item: Item) => (String(item.data.max) === "10" ? 10 : 5);

/** Problems with a form DEFINITION (checked when the form is saved). Returns human-readable messages. */
export function checkDefinition(items: Item[], destination: string, target?: string | null): string[] {
  const issues: string[] = [];
  const seenBefore = new Map<string, Item>();
  const label = (i: Item) => lt(i.data.label ?? i.data.title, "ca") || lt(i.data.body, "ca").slice(0, 30) || i.type;
  for (const item of items) {
    const def = formTypeByName[item.type];
    if (!def) { issues.push(`Tipus de camp desconegut: ${item.type}`); continue; }
    const { list: conds } = conditionsOf(item);
    for (const c of conds) {
      const ref = seenBefore.get(c.field);
      const mark = conds.length > 1 ? ` (condició ${conds.indexOf(c) + 1})` : "";
      if (!ref) { issues.push(`«${label(item)}»${mark}: la condició ha de dependre d'un camp anterior`); continue; }
      if (c.op === "empty" || c.op === "not_empty") continue; // any answerable field can be empty; no value needed
      if (c.op === "contains") {
        if (!TEXT_LIKE.includes(ref.type)) issues.push(`«${label(item)}»${mark}: «conté el text» només serveix per a camps de text; per a opcions, nombres o notes usa «és igual a»`);
        else if (!c.value.trim()) issues.push(`«${label(item)}»${mark}: indica el text que ha de contenir`);
        continue;
      }
      if (["dropdown", "choice"].includes(ref.type) && c.value && !optionValues(ref).includes(c.value))
        issues.push(`«${label(item)}»${mark}: el valor de la condició no és cap opció de «${label(ref)}»`);
      else if (ref.type === "yesno" && !["yes", "no"].includes(c.value)) issues.push(`«${label(item)}»${mark}: el valor de la condició d'un camp Sí / No ha de ser yes o no`);
      else if (ref.type === "rating" && !(Number.isInteger(Number(c.value)) && Number(c.value) >= 1 && Number(c.value) <= ratingMax(ref)))
        issues.push(`«${label(item)}»${mark}: el valor de la condició ha de ser una nota entre 1 i ${ratingMax(ref)}`);
      else if (!c.value) issues.push(`«${label(item)}»${mark}: indica el valor de la condició`);
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
    if (def.input) seenBefore.set(item.id, item); // a title or a paragraph has no answer, so nothing can depend on it
  }
  const keys = new Map<string, string>();
  for (const item of items) {
    const key = prefillKeyOf(item);
    if (!key) continue;
    const name = label(item);
    if (!PREFILL_TYPES.includes(item.type)) issues.push(`«${name}»: aquest tipus de camp no es pot omplir des de l'enllaç`);
    else if (!PREFILL_KEY.test(key)) issues.push(`«${name}»: el nom a l'enllaç ha de començar amb una lletra minúscula i només pot tenir lletres minúscules, xifres, - i _ (fins a 30)`);
    else if (reservedPrefillKey(key)) issues.push(`«${name}»: el nom «${key}» està reservat (campanyes i enllaços privats); tria'n un altre`);
    else if (keys.has(key)) issues.push(`«${name}»: el nom «${key}» ja l'usa «${keys.get(key)}»`);
    else keys.set(key, name);
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
