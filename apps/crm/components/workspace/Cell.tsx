"use client";
// One table cell, edited in place: it saves itself when you leave it (or change a choice) and shows ✓ or the error.
import { useState, useTransition } from "react";
import { saveCellAction } from "@/lib/records/actions";
import { toneOf } from "@/lib/records/tones";
import { Icon } from "./icons";


type Opt = { value: string; label: string };
export function Cell({ entity, id, name, type, value, options, display, required, label }: {
  entity: string; id: string; name: string; type: string; value: string; options?: Opt[]; display?: string; required?: boolean; label: string;
}) {
  const [v, setV] = useState(value);
  const [saved, setSaved] = useState(value);
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  const [, start] = useTransition();

  const save = (next: string) => {
    if (next === saved) return;
    start(async () => {
      const r = await saveCellAction(entity, id, name, next);
      if (r.ok) { setSaved(next); setState("ok"); setMsg(""); setTimeout(() => setState("idle"), 1500); }
      else { setState("err"); setMsg(r.error); }
    });
  };
  const common = { "aria-label": label, className: `ws-cell${state === "err" ? " err" : ""}`, title: msg || (type === "text" || type === "email" || type === "url" || type === "phone" ? v || undefined : undefined), "aria-invalid": state === "err" || undefined } as const;

  if (type === "relation" && !options) return <span className="ws-cell ws-static" title="Es canvia des de la fitxa">{display || "—"}</span>;
  let input;
  if (type === "checkbox") input = <input {...common} type="checkbox" checked={v === "on"} onChange={(e) => { const n = e.target.checked ? "on" : ""; setV(n); save(n); }} />;
  else if (type === "select" || type === "relation") {
    const blank = type === "relation" ? !required : !required && v === ""; // fixed choices only offer "—" while still empty
    input = (
      <select {...common} data-empty={v === "" ? "" : undefined} data-tone={type === "select" ? toneOf(v) : undefined} value={v} onChange={(e) => { setV(e.target.value); save(e.target.value); }}>
        {blank && <option value="">—</option>}
        {(options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  } else if (type === "date") input = <input {...common} type="date" data-empty={v === "" ? "" : undefined} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => save(v)} />;
  else if (type === "textarea") input = <textarea {...common} rows={1} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => save(v)} />;
  else input = <input {...common} type="text" inputMode={type === "money" || type === "percent" ? "decimal" : type === "number" ? "numeric" : undefined} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => save(v)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
  return <span className="ws-cellwrap">{input}{state === "ok" && <span className="ws-ok" aria-hidden><Icon name="check" size={13} /></span>}{state === "err" && <span className="ws-bad" role="alert">{msg}</span>}</span>;
}
