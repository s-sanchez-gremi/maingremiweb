// Computed and merged table columns, per database: what the table can show besides the stored fields.
// "contact" and "place" merge two fields into one two-line cell (links to call or write); the rest come from lib/records/computed.ts.
import Link from "next/link";
import type { ReactNode } from "react";

export type VirtualCtx = { row: Record<string, unknown>; data: Record<string, string | number | null>; open: (sheetTab?: string) => string };
export type VirtualCol = { key: string; label: string; min: number; tile?: boolean; num?: boolean; render: (c: VirtualCtx) => ReactNode };

const month = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("ca-ES", { month: "short", year: "numeric" });
const dash = <span className="ws-dim">—</span>;
const two = (a: ReactNode, b: ReactNode) => <span className="ws-two"><span>{a}</span><span>{b}</span></span>;

const companies: VirtualCol[] = [
  { key: "place", label: "Ubicació", min: 130, render: ({ row }) => (row.city || row.province ? two(String(row.city || row.province), row.city ? String(row.province ?? "") : "") : dash) },
  {
    key: "contact", label: "Contacte", min: 190,
    render: ({ row }) => (row.phone || row.email
      ? two(row.phone ? <a href={`tel:${String(row.phone).replace(/[^\d+]/g, "")}`}>{String(row.phone)}</a> : dash, row.email ? <a href={`mailto:${String(row.email)}`}>{String(row.email)}</a> : "")
      : dash),
  },
  { key: "people", label: "Persones", min: 80, num: true, tile: true, render: ({ data, open }) => (data.people ? <Link href={open("people.companyId")} className="ws-count-link">{data.people}</Link> : dash) },
  { key: "events", label: "Esdeveniments", min: 110, num: true, tile: true, render: ({ data, open }) => (data.events ? <Link href={open("attendance.companyId")} className="ws-count-link">{data.events}</Link> : dash) },
  { key: "lastVisit", label: "Última visita", min: 100, tile: true, render: ({ data }) => (data.lastVisit ? month(String(data.lastVisit)) : dash) },
  { key: "tier", label: "Quota", min: 90, tile: true, render: ({ data }) => (data.tier ? String(data.tier) : dash) },
];

export const VIRTUAL: Record<string, VirtualCol[]> = { companies };
export const virtualCols = (entityKey: string) => VIRTUAL[entityKey] ?? [];
