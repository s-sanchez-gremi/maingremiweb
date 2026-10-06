// One place that turns a stored answer into readable text (staff screens, emails and the spreadsheet export all use it).
// A new field type with a structured value only needs a case here.
import type { Answer } from "@apex/db/schema";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** `listSeparator` joins the options of a multiple-choice answer (", " on screen, "; " in the spreadsheet, whose cells are comma-sensitive). */
export function answerText(a: Pick<Answer, "type" | "value">, listSeparator = ", "): string {
  const v = a.value as unknown;
  if (v === null || v === undefined) return "";
  if (a.type === "file" && typeof v === "object") return str((v as { name?: unknown }).name);
  if (a.type === "address" && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return [str(o.street), [str(o.postalCode), str(o.city)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  }
  if (Array.isArray(v)) return v.map(String).join(listSeparator);
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).map(str).filter(Boolean).join(", "); // an unknown structured value: still readable, never "[object Object]"
  return String(v);
}
