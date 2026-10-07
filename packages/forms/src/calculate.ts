// Calculated fields (Forms v2, item 7): a total or a score worked out from earlier answers. Deliberately NOT a formula language: a
// calculated field is "sum / average / smallest / largest of these earlier questions" (each with an optional weight), plus a fixed
// number. Nothing is evaluated from text, so there is nothing to inject and nothing that can loop or fail at runtime.
// The server always works the value out itself from the validated answers (never from what the browser sent).
import type { Item } from "./fieldTypes";
import type { Cleaned } from "./validate";

export const CALC_OPS = ["sum", "average", "min", "max"] as const;
export type CalcOp = (typeof CALC_OPS)[number];
export type CalcTerm = { field: string; weight: number };
/** The kinds of question a calculation can use (each gives one number, see `termValue`). */
export const CALC_SOURCES = ["number", "rating", "yesno", "checkbox", "dropdown", "choice"];
export const MAX_TERMS = 20;

const parse = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
export const isNumberText = (v: unknown) => v === undefined || v === "" || parse(v) !== null;

/** The terms of a calculated field as stored (`terms`: a list of {field, weight}); a missing weight is 1. */
export function termsOf(item: Item): CalcTerm[] {
  const list = Array.isArray(item.data.terms) ? (item.data.terms as Record<string, unknown>[]) : [];
  return list.flatMap((t) => (t?.field ? [{ field: String(t.field), weight: parse(t.weight) ?? 1 }] : []));
}
export const calcOp = (item: Item): CalcOp => ((CALC_OPS as readonly unknown[]).includes(item.data.op) ? (item.data.op as CalcOp) : "sum");
export const calcDecimals = (item: Item) => { const d = Number(item.data.decimals); return d === 0 || d === 1 ? d : 2; };

/** The points an option of a drop-down / multiple choice is worth (its Catalan label is what answers store); no points = 0. */
export const optionPoints = (item: Item): Map<string, number> =>
  new Map(((item.data.options as { label?: { ca?: string }; points?: unknown }[]) ?? []).map((o) => [(o.label?.ca ?? "").trim(), parse(o.points) ?? 0]));

/** The number one answered question contributes, or null when it was not answered (or is hidden): a number or a mark as it is, Sí = 1 and No = 0, a ticked box = 1, a choice = the points of what was picked. */
export function termValue(source: Item, answer: Cleaned | undefined): number | null {
  if (!answer) return null;
  const v = answer.value;
  switch (source.type) {
    case "number": case "rating": return typeof v === "number" ? v : null;
    case "yesno": return v === true ? 1 : v === false ? 0 : null;
    case "checkbox": return v === true ? 1 : 0;
    case "dropdown": case "choice": {
      const picked = Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : [];
      if (!picked.length) return null;
      const points = optionPoints(source);
      return picked.reduce((sum, p) => sum + (points.get(p) ?? 0), 0);
    }
    default: return null;
  }
}

const round = (n: number, decimals: number) => { const k = 10 ** decimals; return Math.round((n + Number.EPSILON) * k) / k; };

/** The value of a calculated field given the questions answered so far (hidden or unanswered questions simply do not take part). `""` = nothing to calculate yet. */
export function calculate(item: Item, items: Item[], answered: Cleaned[]): number | "" {
  const byId = new Map(answered.map((a) => [a.id, a]));
  const sources = new Map(items.map((i) => [i.id, i]));
  const parts: number[] = [];
  for (const t of termsOf(item)) {
    const source = sources.get(t.field);
    if (!source) continue; // a question that was removed from the form
    const v = termValue(source, byId.get(t.field));
    if (v !== null) parts.push(v * t.weight);
  }
  const offset = parse(item.data.offset) ?? 0;
  const op = calcOp(item);
  let result: number;
  if (op === "sum") result = parts.reduce((a, b) => a + b, 0);
  else if (!parts.length) return "";
  else if (op === "average") result = parts.reduce((a, b) => a + b, 0) / parts.length;
  else result = op === "min" ? Math.min(...parts) : Math.max(...parts);
  return round(result + offset, calcDecimals(item));
}
