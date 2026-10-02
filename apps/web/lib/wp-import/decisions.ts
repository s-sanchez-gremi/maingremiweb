// The review sheet (`wp-export/revisio.csv`): one row per post/page with an "importar" column (sí/no) that a person
// edits in Excel or Numbers. Separator ";" (what Excel uses with Catalan/Spanish settings); "," is accepted too.
import type { Item } from "./build";

const HEAD = ["importar", "id", "tipus", "idioma", "títol", "data", "modificat", "categoria", "pàgina mare", "avisos", "adreça antiga"];

const cell = (v: string) => (/[";\n,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(items: Item[]): string {
  const rows = items.map((it) => [
    it.include ? "sí" : "no", it.key, it.kind === "post" ? "article" : "pàgina", it.locale, it.title, it.date, it.modified,
    it.category?.name ?? "", it.parentTitle, it.warnings.map((w) => `${w.level === "alta" ? "⚠ " : ""}${w.text}`).join(" | "), it.link,
  ]);
  return "﻿" + [HEAD, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const sep = (src.split("\n")[0].match(/;/g)?.length ?? 0) >= (src.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], v = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"' && src[i + 1] === '"') { v += '"'; i++; } else if (c === '"') q = false; else v += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { row.push(v); v = ""; }
    else if (c === "\n") { row.push(v.replace(/\r$/, "")); rows.push(row); row = []; v = ""; }
    else v += c;
  }
  if (v || row.length) { row.push(v.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/** Keys (e.g. "post-12") a person marked to import. Anything else in the column ("no", empty) means leave out. */
export function chosen(csv: string): Set<string> {
  const [head, ...rows] = parseCsv(csv);
  const yes = head.findIndex((h) => h.trim().toLowerCase() === "importar");
  const id = head.findIndex((h) => h.trim().toLowerCase() === "id");
  if (yes < 0 || id < 0) throw new Error("revisio.csv: falten les columnes «importar» i «id»");
  return new Set(rows.filter((r) => /^(s[ií]|si|yes|x|1)$/i.test((r[yes] ?? "").trim())).map((r) => r[id].trim()));
}
