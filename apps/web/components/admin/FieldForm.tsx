"use client";
// Renders a form from a Field[] description (sections/fields.ts). Adding a section type needs no code here.
import type { Field } from "@/sections/fields";
import { ListEditor } from "./ListEditor";

type Data = Record<string, unknown>;
export type Options = { media: { id: string; label: string; url?: string }[]; forms: { id: string; label: string }[] };

export function emptyData(fields: Field[]): Data {
  return Object.fromEntries(fields.map((f) => [f.name, f.kind === "list" ? [] : ""]));
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
          case "image":
          case "form": {
            const list = f.kind === "image" ? options.media : options.forms;
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
                {list.length === 0 && <span className="hint">{f.kind === "image" ? "Encara no hi ha imatges pujades." : "Encara no hi ha formularis."}</span>}
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
          default: // text, link, embed
            return (
              <label key={f.name}>{f.label}{req}
                <input value={String(v ?? "")} onChange={(e) => set(f.name, e.target.value)} type={f.kind === "text" ? "text" : "url"} inputMode={f.kind === "text" ? undefined : "url"} />
              </label>
            );
        }
      })}
    </>
  );
}
