"use client";
// The bar that appears when rows of the table are ticked: change a status, invite to an event, export, archive. Rows are ticked with
// plain checkboxes in the table (class ws-sel); this bar only listens, so the table itself stays server-rendered.
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { bulkArchiveAction, bulkInviteAction, bulkSetAction, type BulkResult } from "@/lib/records/bulk";

type Choice = { value: string; label: string };
export type BulkSelect = { name: string; label: string; choices: Choice[] };

export function BulkBar({ entity, exportPath, selects, events, archivable }: { entity: string; exportPath: string; selects: BulkSelect[]; events?: Choice[]; archivable?: boolean }) {
  const router = useRouter();
  const [ids, setIds] = useState<string[]>([]);
  const [field, setField] = useState(selects[0]?.name ?? "");
  const [value, setValue] = useState("");
  const [event, setEvent] = useState(events?.[0]?.value ?? "");
  const [inviteStatus, setInviteStatus] = useState("invited");
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();

  const read = () => {
    const picked = [...document.querySelectorAll<HTMLInputElement>(".ws-sel:checked")].map((i) => i.dataset.id!).filter(Boolean);
    setIds(picked);
    document.querySelector(".ws-table")?.toggleAttribute("data-selecting", picked.length > 0);
    return picked;
  };
  const clear = () => {
    document.querySelectorAll<HTMLInputElement>(".ws-sel:checked, .ws-sel-all:checked").forEach((i) => { i.checked = false; });
    read();
  };

  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.matches?.(".ws-sel-all")) {
        document.querySelectorAll<HTMLInputElement>(".ws-sel").forEach((i) => { if (!i.closest("tbody[data-folded]")) i.checked = t.checked; });
      }
      if (t.matches?.(".ws-sel, .ws-sel-all")) { setMsg(""); read(); }
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);

  const finish = (r: BulkResult, what: string) => {
    if (!r.ok) { setMsg(r.error ?? "No s'ha pogut fer"); return; }
    setMsg(`${what}: ${r.done}${r.skipped ? ` · ${r.skipped} omeses` : ""}`);
    clear();
    router.refresh();
  };
  const sel = selects.find((s) => s.name === field);
  if (ids.length === 0 && !msg) return null;

  return (
    <div className="ws-bulk" role="region" aria-label="Accions sobre la selecció">
      {ids.length > 0 ? <strong>{ids.length} {ids.length === 1 ? "seleccionada" : "seleccionades"}</strong> : null}
      {ids.length > 0 && <>
        {sel && (
          <span className="ws-bulk-set">
            {selects.length > 1 && <select aria-label="Camp a canviar" value={field} onChange={(e) => { setField(e.target.value); setValue(""); }}>{selects.map((s) => <option key={s.name} value={s.name}>{s.label}</option>)}</select>}
            <select aria-label={`Nou valor de ${sel.label.toLowerCase()}`} value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="">Canvia {sel.label.toLowerCase()}…</option>
              {sel.choices.filter((c) => c.value !== "").map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {value && <button type="button" disabled={busy} onClick={() => start(async () => finish(await bulkSetAction(entity, ids, field, value), "Actualitzades"))}>Aplica</button>}
          </span>
        )}
        {events && events.length > 0 && (
          <span className="ws-bulk-set">
            <select aria-label="Esdeveniment" value={event} onChange={(e) => setEvent(e.target.value)}>{events.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            <select aria-label="Estat de la invitació" value={inviteStatus} onChange={(e) => setInviteStatus(e.target.value)}><option value="invited">Convidades</option><option value="confirmed">Confirmades</option></select>
            <button type="button" disabled={busy || !event} onClick={() => start(async () => finish(await bulkInviteAction(entity, ids, event, inviteStatus), "Convidades"))}>Convida</button>
          </span>
        )}
        <a className="ws-bulk-link" href={`${exportPath}?ids=${ids.join(",")}`}>Exporta</a>
        {archivable && <button type="button" disabled={busy} onClick={() => { if (confirm(`Arxivar ${ids.length} registres? Es poden restaurar des de «Arxivats».`)) start(async () => finish(await bulkArchiveAction(entity, ids), "Arxivades")); }}>Arxiva</button>}
        <span className="ws-spacer" />
        <button type="button" className="ws-bulk-x" onClick={() => { clear(); setMsg(""); }}>Cancel·la</button>
      </>}
      {msg && <span role="status" className="ws-bulk-msg">{msg}</span>}
    </div>
  );
}
