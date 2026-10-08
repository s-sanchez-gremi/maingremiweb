"use client";
// The visual page builder (Elementor-style, brand styles only): block library | live preview | inspector.
// The preview is the real page rendered from the saved draft (/admin/preview), so what you see is what publishes.
// Every change autosaves the DRAFT (never what is live) and reloads the preview. Keyboard users get ↑ ↓ buttons and
// "add" buttons for everything that can be dragged.
import { useCallback, useEffect, useRef, useState } from "react";
import { FieldForm, type Options } from "@apex/ui/components/FieldForm";
import { blockByName, blockDefs, COLUMN_FIELDS, columnCount, styleFields } from "@apex/sections/blocks";
import { UNSTYLED, sectionByName, sectionDefs } from "@apex/sections/registry";
import type { Field } from "@apex/core/fields";
import {
  duplicate, findBlock, insertBlock, insertSection, moveBlock, moveSection, newBlock, newSection, nudge, removeBlock, removeSection, setLayout,
  type SectionItem, type Target,
} from "@/lib/builder-ops";
import type { ToEditor, ToPreview } from "@apex/sections/preview-messages";
import { setPath } from "@apex/sections/inline-edit";

const MIME = "application/x-apex";
type Payload = { kind: "new-block" | "new-section"; type: string } | { kind: "move-block" | "move-section"; id: string };
const DEFAULT_STYLE = { bg: "auto", space: "m", align: "left" };
const DESKTOP = 1280;

export function VisualEditor({ entryId, locale, sections, onChange, options, save, previewBase = "" }: {
  entryId: string; locale: string; sections: SectionItem[]; onChange: (next: SectionItem[]) => void; options: Options;
  save: (id: string, locale: string, json: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  previewBase?: string; // where the website serves /admin/preview (empty = this same origin)
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const previewUrl = `${previewBase}/admin/preview/${entryId}?locale=${locale}`;
  const previewOrigin = useCallback(() => (previewBase ? new URL(previewBase).origin : location.origin), [previewBase]); // messages are only sent to, and accepted from, the preview's own origin
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [state, setState] = useState<"saved" | "saving" | { error: string }>("saved");
  const [dragging, setDragging] = useState(false); // a library block is being dragged: the drop layer over the preview is shown
  const pending = useRef<Payload | null>(null);   // what was dropped, until the preview says where
  const [blocked, setBlocked] = useState(false); // the browser refused to show the preview in the frame
  const first = useRef(true);
  // Desktop preview renders at a real desktop width and is scaled down to fit, so it shows the desktop layout.
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setFit({ scale: Math.min(1, e.contentRect.width / DESKTOP), h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const latest = useRef(sections);
  useEffect(() => { latest.current = sections; }, [sections]);

  // Autosave the draft, then reload the preview so it shows exactly what was saved.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setState("saving");
    const t = setTimeout(async () => {
      const r = await save(entryId, locale, JSON.stringify(sections));
      if (!r.ok) return setState({ error: r.error });
      setState("saved");
      if (frame.current) frame.current.src = frame.current.src; // reload (works across origins)
    }, 450);
    return () => clearTimeout(t);
  }, [sections, entryId, locale, save]);

  const tell = useCallback((id: string | null) => {
    frame.current?.contentWindow?.postMessage({ apex: "selected", id } satisfies ToPreview, previewOrigin());
  }, [previewOrigin]);
  const select = useCallback((id: string | null) => { setSelected(id); tell(id); }, [tell]);

  const apply = useCallback((payload: Payload, t: Target) => {
    const cur = latest.current;
    if (payload.kind === "new-block") { const b = newBlock(payload.type); onChange(insertBlock(cur, b, t)); setSelected(b.id); }
    else if (payload.kind === "new-section") { const s = newSection(payload.type); onChange(insertSection(cur, s, t)); setSelected(s.id); }
    else if (payload.kind === "move-block") onChange(moveBlock(cur, payload.id, t));
    else if (payload.kind === "move-section" && t.section === undefined) onChange(moveSection(cur, payload.id, t.index));
  }, [onChange]);

  useEffect(() => {
    const onMessage = (e: MessageEvent<ToEditor | { apex: "ready" }>) => {
      if (e.origin !== previewOrigin() || e.source !== frame.current?.contentWindow) return;
      const m = e.data;
      if (m?.apex === "ready") tell(selected);
      else if (m?.apex === "select") { setSelected(m.id); tell(m.id); }
      else if (m?.apex === "edit") {
        const cur = latest.current;
        const f = findBlock(cur, m.id);
        if (f) onChange(cur.map((s) => s.id !== f.section.id ? s : { ...s, data: { ...s.data, [f.col]: (s.data[f.col] as { id: string }[]).map((b) => (b.id === m.id ? { ...f.block, data: setPath(f.block.data, m.field, m.value) } : b)) } }));
        else onChange(cur.map((s) => (s.id === m.id ? { ...s, data: setPath(s.data, m.field, m.value) } : s)));
      }
      else if (m?.apex === "located") {
        const p = pending.current;
        pending.current = null;
        if (p) apply(p, m.target as Target);
      }
      else if (m?.apex === "drop") {
        try { apply(JSON.parse(m.payload) as Payload, m.target as Target); } catch { /* not ours */ }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [apply, onChange, previewOrigin, selected, tell]);

  // Click-to-add (also the keyboard route): after the selection, or at the end of the page.
  const addBlockHere = (type: string) => {
    const b = newBlock(type);
    const f = selected ? findBlock(sections, selected) : null;
    const sec = !f && selected ? sections.find((s) => s.id === selected) : undefined;
    const t: Target = f ? { section: f.section.id, col: f.col, index: f.index + 1 }
      : sec?.type === "columns" ? { section: sec.id, col: "c1", index: ((sec.data.c1 as unknown[]) ?? []).length }
      : { index: sec ? sections.indexOf(sec) + 1 : sections.length };
    onChange(insertBlock(sections, b, t));
    select(b.id);
  };
  const addSectionHere = (type: string) => {
    const s = newSection(type);
    const f = selected ? findBlock(sections, selected) : null;
    const at = f ? sections.indexOf(f.section) + 1 : selected ? sections.findIndex((x) => x.id === selected) + 1 : sections.length;
    onChange(insertSection(sections, s, { index: at > 0 ? at : sections.length }));
    select(s.id);
  };
  const drag = (p: Payload) => (e: React.DragEvent) => { e.dataTransfer.setData(MIME, JSON.stringify(p)); e.dataTransfer.effectAllowed = "copyMove"; setDragging(true); };
  useEffect(() => {
    const end = () => setDragging(false);
    window.addEventListener("dragend", end);
    window.addEventListener("drop", end);
    return () => { window.removeEventListener("dragend", end); window.removeEventListener("drop", end); };
  }, []);
  // The drop layer sits over the preview, so the drop happens in THIS page (works whatever origin the preview has); the preview is
  // asked which section or block is under the pointer. The preview may be scaled down to fit: convert to its own pixels.
  const locate = (e: React.DragEvent, commit: boolean) => {
    const f = frame.current;
    if (!f) return;
    const r = f.getBoundingClientRect();
    const sx = r.width / (f.offsetWidth || 1), sy = r.height / (f.offsetHeight || 1);
    f.contentWindow?.postMessage({ apex: "locate", x: (e.clientX - r.left) / sx, y: (e.clientY - r.top) / sy, commit } satisfies ToPreview, previewOrigin());
  };

  const block = selected ? findBlock(sections, selected) : null;
  const section = !block && selected ? sections.find((s) => s.id === selected) ?? null : null;
  const updateSection = (s: SectionItem) => onChange(sections.map((x) => (x.id === s.id ? s : x)));
  const updateBlockData = (data: Record<string, unknown>) => {
    if (!block) return;
    updateSection({ ...block.section, data: { ...block.section.data, [block.col]: (block.section.data[block.col] as { id: string }[]).map((b) => (b.id === block.block.id ? { ...block.block, data } : b)) } });
  };
  const remove = () => {
    if (!selected) return;
    if (!confirm(block ? "Eliminar aquest bloc?" : "Eliminar aquesta secció?")) return;
    onChange(block ? removeBlock(sections, selected) : removeSection(sections, selected));
    select(null);
  };

  const tools = selected && (
    <div className="b-tools">
      <button type="button" className="btn" onClick={() => onChange(nudge(sections, selected, -1))} aria-label="Amunt">↑</button>
      <button type="button" className="btn" onClick={() => onChange(nudge(sections, selected, 1))} aria-label="Avall">↓</button>
      <button type="button" className="btn" onClick={() => onChange(duplicate(sections, selected))}>Duplica</button>
      <button type="button" className="btn danger" onClick={remove}>Elimina</button>
    </div>
  );

  return (
    <div className="builder">
      <aside className="b-lib" aria-label="Biblioteca">
        <h3>Blocs</h3>
        <p className="hint">Arrossega&apos;ls a la pàgina o fes-hi clic.</p>
        <div className="b-grid">
          {blockDefs.map((d) => (
            <button type="button" key={d.name} draggable onDragStart={drag({ kind: "new-block", type: d.name })} onClick={() => addBlockHere(d.name)}>{d.label}</button>
          ))}
        </div>
        <h3>Seccions</h3>
        <div className="b-grid">
          {sectionDefs.filter((d) => d.name !== "columns").map((d) => (
            <button type="button" key={d.name} draggable onDragStart={drag({ kind: "new-section", type: d.name })} onClick={() => addSectionHere(d.name)}>{d.label}</button>
          ))}
          <button type="button" draggable onDragStart={drag({ kind: "new-section", type: "columns" })} onClick={() => addSectionHere("columns")}>Columnes buides</button>
        </div>
      </aside>

      <div className="b-canvas">
        <div className="b-bar">
          <div className="b-devices" role="group" aria-label="Mida de pantalla">
            <button type="button" className="btn" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>Ordinador</button>
            <button type="button" className="btn" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>Mòbil</button>
          </div>
          <a className="hint" href={previewUrl} target="_blank" rel="noopener">Obre la vista prèvia en una pestanya nova</a>
          <span className="hint" aria-live="polite">{state === "saved" ? "Esborrany desat" : state === "saving" ? "Desant…" : state.error}</span>
        </div>
        <div className={`b-frame ${device}`} ref={box}>
          {blocked && (
            <div className="b-blocked" role="alert">
              <p>El navegador no ha pogut mostrar la vista prèvia aquí.</p>
              <p><button type="button" className="btn" onClick={() => location.reload()}>Torna a carregar l&apos;editor</button>{" "}
                <a href={previewUrl} target="_blank" rel="noopener">Obre-la en una pestanya nova</a> per veure què passa.</p>
            </div>
          )}
          {dragging && (
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 5 }}
              onDragOver={(e) => { e.preventDefault(); locate(e, false); }}
              onDragLeave={() => frame.current?.contentWindow?.postMessage({ apex: "locate-end" } satisfies ToPreview, previewOrigin())}
              onDrop={(e) => {
                e.preventDefault();
                try { pending.current = JSON.parse(e.dataTransfer.getData(MIME)) as Payload; } catch { pending.current = null; }
                locate(e, true);
              }} />
          )}
          <iframe ref={frame} title="Vista prèvia de la pàgina" src={previewUrl}
            onLoad={() => { if (previewBase) return; try { setBlocked(!frame.current?.contentWindow?.location.pathname.startsWith("/admin/preview")); } catch { setBlocked(true); } }}
            style={device === "desktop" && fit.scale < 1 ? { width: DESKTOP, height: fit.h / fit.scale, transform: `scale(${fit.scale})`, transformOrigin: "0 0" } : undefined} />
        </div>
      </div>

      <aside className="b-inspect" aria-label="Propietats">
        {!selected && (
          <div className="card">
            <h3>Edita la pàgina</h3>
            <p className="hint">Fes clic a qualsevol part de la vista prèvia per editar-la. Arrossega blocs i seccions per moure&apos;ls.</p>
            <p className="hint">Els canvis es desen a l&apos;esborrany. La web no canvia fins que premis <strong>Publica</strong>.</p>
          </div>
        )}
        {block && (
          <div className="card">
            <div className="row"><h3>{blockByName[block.block.type]?.label ?? "Bloc"}</h3><button type="button" className="btn link" onClick={() => select(block.section.id)}>Secció ↑</button></div>
            {tools}
            <FieldForm fields={blockByName[block.block.type]?.fields ?? []} data={block.block.data} onChange={updateBlockData} options={options} />
          </div>
        )}
        {section && (
          <>
            <div className="card">
              <h3>{sectionByName[section.type]?.label ?? section.type}</h3>
              {tools}
              {section.type === "columns" ? (
                <>
                  <FieldForm fields={(sectionByName.columns.fields as Field[]).filter((f) => f.name === "heading")} data={section.data} onChange={(data) => updateSection({ ...section, data })} options={options} />
                  <FieldForm fields={(sectionByName.columns.fields as Field[]).filter((f) => f.name === "layout")} data={section.data}
                    onChange={(data) => updateSection(setLayout(section, String(data.layout)))} options={options} />
                  {COLUMN_FIELDS.slice(0, columnCount(section.data.layout)).map((c, i) => (
                    <div key={c} className="b-colist">
                      <strong>Columna {i + 1}</strong>
                      {((section.data[c] as { id: string; type: string }[]) ?? []).map((b) => (
                        <button type="button" key={b.id} onClick={() => select(b.id)}>{blockByName[b.type]?.label ?? b.type}</button>
                      ))}
                    </div>
                  ))}
                </>
              ) : (
                <FieldForm fields={sectionByName[section.type]?.fields ?? []} data={section.data} onChange={(data) => updateSection({ ...section, data })} options={options} />
              )}
            </div>
            {!UNSTYLED.has(section.type) && (
              <div className="card">
                <h3>Estil</h3>
                <FieldForm fields={styleFields} data={{ ...DEFAULT_STYLE, ...section.style }} onChange={(style) => updateSection({ ...section, style: style as Record<string, string> })} options={options} />
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
