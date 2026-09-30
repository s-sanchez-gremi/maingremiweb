// Spreadsheet export (CSV, UTF-8 with BOM so Excel and Google Sheets open accents correctly).
import type { Answer } from "@/db/schema";

/** A cell that starts with = + - @ would be executed as a formula by a spreadsheet: neutralise it. */
export function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const show = (a: Answer | undefined): string => {
  if (!a) return "";
  const v = a.value as unknown;
  if (a.type === "file" && v && typeof v === "object") return (v as { name?: string }).name ?? "";
  if (Array.isArray(v)) return v.join("; ");
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return v === null || v === undefined ? "" : String(v);
};

export type ExportRow = { createdAt: Date; locale: string; sourcePath: string; theme: string; utm: Record<string, string>; consentText: string; consentAt: Date | null; answers: Answer[] };

export function toCsv(rows: ExportRow[]): string {
  // Columns follow the fields as they appear in the responses (newest label wins), so edited forms still export cleanly.
  const cols = new Map<string, string>();
  for (const r of [...rows].reverse()) for (const a of r.answers) cols.set(a.id, a.label);
  const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  const head = ["Data", "Idioma", "Pàgina d'origen", "Tema", ...utmKeys, "Consentiment (text)", "Consentiment (data)", ...cols.values()];
  const lines = [head.map(cell).join(";")];
  for (const r of rows) {
    lines.push([
      r.createdAt.toISOString(), r.locale, r.sourcePath, r.theme, ...utmKeys.map((k) => r.utm[k] ?? ""), r.consentText, r.consentAt?.toISOString() ?? "",
      ...[...cols.keys()].map((id) => show(r.answers.find((a) => a.id === id))),
    ].map(cell).join(";"));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
