"use client";
// Tags (several choices on one record). `TagsEditor` is the control; `TagsInput` puts it in a form (value sent as "a|b"); `TagsCell` is the
// in-place table cell: a row of pills that opens a small menu and saves on every change, like the other cells.
import { useState, useTransition } from "react";
import { saveCellAction } from "@/lib/records/actions";
import { Icon } from "./icons";

type Choice = readonly [value: string, label: string];
const labelOf = (choices: readonly Choice[] | undefined, v: string) => choices?.find(([x]) => x === v)?.[1] ?? v;

export function Pills({ value, choices }: { value: string[]; choices?: readonly Choice[] }) {
  if (value.length === 0) return <span className="ws-dim">—</span>;
  return <>{value.map((t) => <span key={t} className="ws-tag">{labelOf(choices, t)}</span>)}</>;
}

export function TagsEditor({ value, onChange, choices, label }: { value: string[]; onChange: (next: string[]) => void; choices?: readonly Choice[]; label: string }) {
  const [draft, setDraft] = useState("");
  const toggle = (t: string) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  const add = () => { const t = draft.trim().replace(/\|/g, "").slice(0, 60); if (t && !value.includes(t)) onChange([...value, t]); setDraft(""); };
  return (
    <div className="ws-tags-editor" role="group" aria-label={label}>
      {choices ? choices.map(([v, l]) => (
        <button key={v} type="button" className="ws-tag" aria-pressed={value.includes(v)} onClick={() => toggle(v)}>{value.includes(v) && <Icon name="check" size={11} />}{l}</button>
      )) : (
        <>
          {value.map((t) => <button key={t} type="button" className="ws-tag" aria-pressed="true" aria-label={`Treu ${t}`} onClick={() => toggle(t)}>{t}<Icon name="close" size={11} /></button>)}
          <input
            value={draft} placeholder="Afegeix i prem Intro" aria-label={`Nova etiqueta (${label})`} maxLength={60}
            onChange={(e) => setDraft(e.target.value)} onBlur={add}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1)); }}
          />
        </>
      )}
    </div>
  );
}

export function TagsInput({ name, label, defaultValue, choices }: { name: string; label: string; defaultValue: string[]; choices?: readonly Choice[] }) {
  const [value, setValue] = useState(defaultValue);
  return <><input type="hidden" name={name} value={value.join("|")} /><TagsEditor value={value} onChange={setValue} choices={choices} label={label} /></>;
}

export function TagsCell({ entity, id, name, value, choices, label }: { entity: string; id: string; name: string; value: string[]; choices?: readonly Choice[]; label: string }) {
  const [tags, setTags] = useState(value);
  const [err, setErr] = useState("");
  const [, start] = useTransition();
  const change = (next: string[]) => {
    const before = tags;
    setTags(next); setErr("");
    start(async () => { const r = await saveCellAction(entity, id, name, next.join("|")); if (!r.ok) { setTags(before); setErr(r.error); } });
  };
  return (
    <details className="ws-tagscell">
      <summary aria-label={label}><Pills value={tags} choices={choices} /></summary>
      <div><TagsEditor value={tags} onChange={change} choices={choices} label={`Tria: ${label}`} />{err && <p role="alert" className="ws-bad-inline">{err}</p>}</div>
    </details>
  );
}
