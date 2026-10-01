"use client";
// Renders a form from a Field[] description (sections/fields.ts). Adding a section type needs no code here.
import type { Field } from "@apex/core/fields";
import { ListEditor } from "./ListEditor";

type Data = Record<string, unknown>;
export type Options = { media: { id: string; label: string; url?: string }[]; forms: { id: string; label: string }[]; pages?: { id: string; label: string }[]; earlier?: { id: string; label: string }[] };

export function emptyData(fields: Field[]): Data {
  return Object.fromEntries(fields.map((f) => [f.name, f.kind === "list" || f.kind === "blocks" ? [] : f.kind === "ltext" || f.kind === "ltextarea" ? { ca: "", es: "", en: "" } : f.kind === "select" ? f.options[0].value : ""]));
}

export function FieldForm({ fields, data, onChange, options }: {
  fields: Field[]; data: Data; onChange: (next: Data) => void; options: Options;
}) {
  const set = (name: string, value: unknown) => onChange({ ...data, [name]: value });
  return (
    <>
      {fields.map((f) => {
        const v = data[f.name];
        const req = "required" in f && f.required ? " *" : "";
        switch (f.kind) {
          case "textarea":
            return <label key={f.name}>{f.label}{req}<textarea value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} /></label>;
          case "fieldref": {
            const list = options.earlier ?? [];
            return (
              <label key={f.name}>{f.label}
                <select value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)}>
                  <option value="">— sempre visible —</option>
                  {list.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
            );
          }
          case "ltext":
          case "ltextarea": {
            const val = (v ?? {}) as Record<string, string>;
            return (
              <fieldset key={f.name} style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                <legend style={{ fontSize: 12, color: "var(--text2)", padding: 0, marginBottom: 4 }}>{f.label}{req}</legend>
                {(["ca", "es", "en"] as const).map((l) => (
                  <label key={l} style={{ gridTemplateColumns: "34px 1fr", alignItems: "center" }}>
                    <span>{l.toUpperCase()}</span>
                    {f.kind === "ltextarea"
                      ? <textarea style={{ minHeight: 70 }} value={val[l] ?? ""} onChange={(e) => set(f.name, { ...val, [l]: e.target.value })} />
                      : <input value={val[l] ?? ""} onChange={(e) => set(f.name, { ...val, [l]: e.target.value })} />}
                  </label>
                ))}
              </fieldset>
            );
          }
          case "image":
          case "form":
          case "entry": {
            const list = f.kind === "image" ? options.media : f.kind === "entry" ? (options.pages ?? []) : options.forms;
            return (
              <label key={f.name}>{f.label}{req}
                <select value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)}>
                  <option value="">— cap —</option>
                  {list.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                {f.kind === "image" && v ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={options.media.find((m) => m.id === v)?.url} alt="" style={{ maxHeight: 90, objectFit: "contain", alignSelf: "start", borderRadius: 4 }} />
                ) : null}
                {list.length === 0 && <span className="hint">{f.kind === "image" ? "Encara no hi ha imatges pujades." : f.kind === "entry" ? "Encara no hi ha pàgines." : "Encara no hi ha formularis."}</span>}
              </label>
            );
          }
          case "select":
            return (
              <label key={f.name}>{f.label}{req}
                <select value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)}>
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            );
          case "list":
            return (
              <div key={f.name} className="nested">
                <strong style={{ fontSize: 12 }}>{f.label}</strong>
                <ListEditor
                  items={(v as Data[]) ?? []}
                  onChange={(next) => set(f.name, next)}
                  title={(_, i) => `${f.label} ${i + 1}`}
                  render={(item, update) => <FieldForm fields={f.fields} data={item} onChange={update} options={options} />}
                  add={{ label: "Afegeix", make: () => emptyData(f.fields) }}
                />
              </div>
            );
          case "blocks": {
            type B = { id: string; type: string; data: Data };
            const byName = Object.fromEntries(f.blocks.map((d) => [d.name, d]));
            return (
              <div key={f.name} className="nested">
                <strong style={{ fontSize: 12 }}>{f.label}</strong>
                <ListEditor<B>
                  items={(v as B[]) ?? []}
                  onChange={(next) => set(f.name, next)}
                  title={(b) => byName[b.type]?.label ?? b.type}
                  render={(b, update) => <FieldForm fields={byName[b.type]?.fields ?? []} data={b.data} onChange={(data) => update({ ...b, data })} options={options} />}
                  add={{ label: "Afegeix un bloc", options: f.blocks.map((d) => ({ value: d.name, label: d.label })), make: (type) => ({ id: crypto.randomUUID(), type, data: emptyData(byName[type].fields) }) }}
                />
              </div>
            );
          }
          default: // text, link, embed
            return (
              <label key={f.name}>{f.label}{req}
                <input value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} type={f.kind === "embed" ? "url" : "text"} inputMode={f.kind === "text" ? undefined : "url"} placeholder={f.kind === "link" ? "/ca/pagina  o  https://…" : undefined} />
              </label>
            );
        }
      })}
    </>
  );
}
