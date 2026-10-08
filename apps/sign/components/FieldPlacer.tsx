"use client";
// Place a field on a page: click on the page outline (or type the numbers: both always work), choose who signs it and what it is, add it.
// The outline is the page's proportions with the fields already placed; the PDF itself is drawn in it from step S3 (the signer's viewer).
import { useState } from "react";
import { DEFAULT_SIZE, FIELD_KINDS, KIND_LABEL, placeAt, type FieldKind } from "@apex/sign/geometry";

export type PlacerField = { id: string; signerNo: number; kind: FieldKind; page: number; x: number; y: number; w: number; h: number; required: boolean };
type Props = {
  requestId: string;
  signers: { id: string; name: string }[];
  pages: { w: number; h: number }[];
  fields: PlacerField[];
  initialPage: number;
  action: (fd: FormData) => void | Promise<void>;
};

export function FieldPlacer({ requestId, signers, pages, fields, initialPage, action }: Props) {
  const [page, setPage] = useState(Math.min(Math.max(initialPage, 1), pages.length));
  const [kind, setKind] = useState<FieldKind>("signature");
  const [signerId, setSignerId] = useState(signers[0]?.id ?? "");
  const [required, setRequired] = useState(true);
  const [box, setBox] = useState({ x: "10", y: "80", w: String(DEFAULT_SIZE.signature.w), h: String(DEFAULT_SIZE.signature.h) });
  const size = pages[page - 1] ?? { w: 595, h: 842 };
  const num = (v: string) => Number(v.replace(",", "."));

  if (!signers.length) return <p className="hint">Afegeix primer almenys un signant per poder situar-li camps.</p>;

  const onKind = (k: FieldKind) => { setKind(k); setBox((b) => ({ ...b, w: String(DEFAULT_SIZE[k].w), h: String(DEFAULT_SIZE[k].h) })); };
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const b = placeAt(kind, ((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
    setBox({ x: String(b.x), y: String(b.y), w: String(b.w), h: String(b.h) });
  };
  const pending = { x: num(box.x), y: num(box.y), w: num(box.w), h: num(box.h) };
  const valid = [pending.x, pending.y, pending.w, pending.h].every(Number.isFinite) && pending.x >= 0 && pending.y >= 0 && pending.w > 0 && pending.h > 0 && pending.x + pending.w <= 100.0001 && pending.y + pending.h <= 100.0001;

  return (
    <form action={action} style={{ display: "grid", gap: 12 }}>
      <input type="hidden" name="id" value={requestId} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
        <label>Pàgina
          <select name="page" value={page} onChange={(e) => setPage(Number(e.target.value))}>
            {pages.map((_, i) => <option key={i} value={i + 1}>{i + 1} de {pages.length}</option>)}
          </select>
        </label>
        <label>Signant
          <select name="signerId" value={signerId} onChange={(e) => setSignerId(e.target.value)}>
            {signers.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {s.name}</option>)}
          </select>
        </label>
        <label>Tipus
          <select name="kind" value={kind} onChange={(e) => onKind(e.target.value as FieldKind)}>
            {FIELD_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" name="required" value="1" checked={required} onChange={(e) => setRequired(e.target.checked)} style={{ width: "auto" }} /> Obligatori
        </label>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
        {(["x", "y", "w", "h"] as const).map((k) => (
          <label key={k} style={{ width: 96 }}>{{ x: "Esquerra %", y: "A dalt %", w: "Amplada %", h: "Alçada %" }[k]}
            <input name={k} type="number" inputMode="decimal" step="any" min={0} max={100} value={box[k]} onChange={(e) => setBox({ ...box, [k]: e.target.value })} required />
          </label>
        ))}
        <button className="btn primary" type="submit" disabled={!valid}>Afegeix el camp</button>
      </div>
      {!valid && <p className="hint" role="status">El camp ha de ser dins de la pàgina.</p>}
      <div
        role="img" aria-label={`Contorn de la pàgina ${page}: clica per situar el camp`} onClick={onClick}
        style={{ position: "relative", width: "100%", maxWidth: 420, aspectRatio: `${size.w} / ${size.h}`, background: "#fff", border: "1px solid var(--border, #D8D0C1)", cursor: "crosshair", boxShadow: "0 1px 4px rgba(0,0,0,.12)" }}
      >
        {fields.filter((f) => f.page === page).map((f) => (
          <div key={f.id} style={{ position: "absolute", left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%`, border: "1px solid var(--ink, #1A1715)", background: "color-mix(in srgb, var(--ink, #1A1715) 8%, transparent)", fontSize: 10, overflow: "hidden", pointerEvents: "none", padding: 1 }}>
            {f.signerNo} · {KIND_LABEL[f.kind]}{f.required ? "" : " (opc.)"}
          </div>
        ))}
        {valid && <div style={{ position: "absolute", left: `${pending.x}%`, top: `${pending.y}%`, width: `${pending.w}%`, height: `${pending.h}%`, border: "2px solid var(--accent, #D50032)", background: "color-mix(in srgb, var(--accent, #D50032) 14%, transparent)", pointerEvents: "none" }} />}
      </div>
    </form>
  );
}
