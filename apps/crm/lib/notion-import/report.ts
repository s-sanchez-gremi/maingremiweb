// What an import run did, in numbers and masked samples (no personal data in the report itself).
export type Report = { source: string; read: number; created: number; updated: number; skipped: number; notes: string[]; samples: string[]; extra: Record<string, number> };
export const newReport = (source: string): Report => ({ source, read: 0, created: 0, updated: 0, skipped: 0, notes: [], samples: [], extra: {} });
export const bump = (r: Report, k: string, n = 1) => { r.extra[k] = (r.extra[k] ?? 0) + n; };
export function formatReport(r: Report) {
  const lines = [`== ${r.source}: ${r.read} read · ${r.created} created · ${r.updated} updated · ${r.skipped} skipped`];
  for (const [k, v] of Object.entries(r.extra)) lines.push(`   ${k}: ${v}`);
  for (const n of r.notes) lines.push(`   ! ${n}`);
  for (const s of r.samples.slice(0, 5)) lines.push(`   e.g. ${s}`);
  return lines.join("\n");
}
