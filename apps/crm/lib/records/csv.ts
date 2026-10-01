// A small CSV reader (RFC 4180: quotes, doubled quotes, line breaks inside quotes; comma, semicolon or tab; optional BOM).
export function detectDelimiter(text: string) {
  const head = text.slice(0, text.search(/\r?\n/) === -1 ? undefined : text.search(/\r?\n/));
  let inQ = false; const n: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  for (const ch of head) { if (ch === '"') inQ = !inQ; else if (!inQ && ch in n) n[ch]++; }
  return (Object.entries(n).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(n).sort((a, b) => b[1] - a[1])[0][0] : ";");
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const d = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === d) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((c) => c.trim() !== "")) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}
