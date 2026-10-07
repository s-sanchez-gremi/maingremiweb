// Ways of looking at a form's responses (Forms v2, item 10): a table with one column per question, a board grouped by a choice question,
// search and a filter. Pure functions over the stored answers, so they are unit-tested; the page only draws what they return.
import type { Answer } from "@apex/db/schema";
import { answerText } from "./answer-text";
import { formTypeByName, lt, optionValues, type Item } from "./fieldTypes";

export type ResponseRow = { id: string; createdAt: Date; locale: string; answers: Answer[] };
export type Column = { id: string; label: string; type: string };

/** The questions of the form that take an answer, in the form's order: the columns of the table. */
export const columnsOf = (items: Item[]): Column[] =>
  items.filter((i) => formTypeByName[i.type]?.input).map((i) => ({ id: i.id, label: lt(i.data.label, "ca") || i.type, type: i.type }));

/** The questions that can group a board or filter the list: choices (one option per column). */
export const GROUPABLE = ["dropdown", "choice", "yesno", "checkbox", "rating"];
export const groupableOf = (items: Item[]): Column[] => columnsOf(items).filter((c) => GROUPABLE.includes(c.type));

const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const answerOf = (row: ResponseRow, id: string) => row.answers.find((a) => a.id === id);

/** The values a response gives to a choice question, as the text a person reads (a multiple choice gives several; no answer gives none). */
export function valuesOf(row: ResponseRow, field: Column): string[] {
  const a = answerOf(row, field.id);
  if (!a) return [];
  const v = a.value as unknown;
  if (field.type === "checkbox") return v === true ? ["Marcada"] : [];
  if (field.type === "yesno") return typeof v === "boolean" ? [v ? "Sí" : "No"] : [];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  const t = answerText(a).trim();
  return t ? [t] : [];
}

export type Query = { q?: string; field?: string; value?: string };

/** Search (every word, accents and case ignored, over every answer) and an optional «this question has this value». */
export function filterRows(rows: ResponseRow[], columns: Column[], query: Query): ResponseRow[] {
  const words = plain(query.q ?? "").split(/\s+/).filter(Boolean);
  const field = query.field ? columns.find((c) => c.id === query.field && GROUPABLE.includes(c.type)) : undefined;
  return rows.filter((r) => {
    if (field && query.value !== undefined && query.value !== "") {
      const have = valuesOf(r, field);
      if (query.value === NONE ? have.length > 0 : !have.includes(query.value)) return false;
    }
    if (!words.length) return true;
    const haystack = plain(r.answers.map((a) => answerText(a)).join(" "));
    return words.every((w) => haystack.includes(w));
  });
}

export const NONE = "__none__"; // the board's column (and filter value) for responses that did not answer the question

export type Lane = { value: string; label: string; rows: ResponseRow[] };

/** One lane per option of the question, in the form's order, then the values that are no longer options, then the responses without an answer. A multiple choice appears in every lane it picked. */
export function lanes(rows: ResponseRow[], field: Column, item: Item | undefined): Lane[] {
  const options = item && (item.type === "dropdown" || item.type === "choice") ? optionValues(item)
    : field.type === "yesno" ? ["Sí", "No"] : field.type === "checkbox" ? ["Marcada"]
    : field.type === "rating" ? Array.from({ length: item && String(item.data.max) === "10" ? 10 : 5 }, (_, i) => String(i + 1)) : [];
  const by = new Map<string, ResponseRow[]>(options.map((o) => [o, []]));
  const none: ResponseRow[] = [];
  for (const r of rows) {
    const values = valuesOf(r, field);
    if (!values.length) { none.push(r); continue; }
    for (const v of values) { if (!by.has(v)) by.set(v, []); by.get(v)!.push(r); }
  }
  return [...[...by].map(([value, rs]) => ({ value, label: value, rows: rs })), { value: NONE, label: "Sense resposta", rows: none }];
}

/** The cell of a table: readable text, cut short (the whole answer is one click away). */
export const cellText = (row: ResponseRow, column: Column, max = 80): string => {
  const a = answerOf(row, column.id);
  const t = a ? answerText(a).replace(/\s+/g, " ").trim() : "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
