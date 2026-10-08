// Spreadsheet export (CSV, UTF-8 with BOM so Excel and Google Sheets open accents correctly).
import type { Answer } from "@apex/db/schema";
import { answerText } from "./answer-text";
import { toXlsx, type XlsxCell } from "./xlsx";

/** A cell that starts with = + - @ would be executed as a formula by a spreadsheet: neutralise it. */
export function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const show = (a: Answer | undefined): string => (a ? answerText(a, "; ") : "");

export type ExportRow = { createdAt: Date; locale: string; sourcePath: string; theme: string; utm: Record<string, string>; consentText: string; consentAt: Date | null; answers: Answer[] };

/** The one table both formats are made from: a header and the rows. A number answer stays a number (a spreadsheet can add it up); the rest is text. */
export function table(rows: ExportRow[]): { head: string[]; body: XlsxCell[][] } {
  // Columns follow the fields as they appear in the responses (newest label wins), so edited forms still export cleanly.
  const cols = new Map<string, string>();
  for (const r of [...rows].reverse()) for (const a of r.answers) cols.set(a.id, a.label);
  const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  const head = ["Data", "Idioma", "Pàgina d'origen", "Tema", ...utmKeys, "Consentiment (text)", "Consentiment (data)", ...cols.values()];
  const body = rows.map((r) => [
    r.createdAt.toISOString(), r.locale, r.sourcePath, r.theme, ...utmKeys.map((k) => r.utm[k] ?? ""), r.consentText, r.consentAt?.toISOString() ?? "",
    ...[...cols.keys()].map((id): XlsxCell => {
      const a = r.answers.find((x) => x.id === id);
      return a && (a.type === "number" || a.type === "rating" || a.type === "calculated") && typeof a.value === "number" ? a.value : show(a);
    }),
  ]);
  return { head, body };
}

export function toCsv(rows: ExportRow[]): string {
  const { head, body } = table(rows);
  return "\ufeff" + [head, ...body].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

/** The same table as an Excel file (inline text, so nothing in it can run as a formula). */
export const toXlsxFile = (rows: ExportRow[], title: string): Uint8Array => { const { head, body } = table(rows); return toXlsx(title, head, body); };
