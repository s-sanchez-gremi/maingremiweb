"use client";
import Link from "next/link";
import { useState } from "react";
import { FieldForm, emptyData } from "@apex/ui/components/FieldForm";
import { ListEditor } from "@apex/ui/components/ListEditor";
import { formTypeByName, formTypeDefs, lt, type Item } from "@apex/forms/fieldTypes";
import { formSettingsFields, type FormSettings } from "@apex/forms/settings-fields";
import type { Field } from "@apex/core/fields";
import { copyForm, removeForm, saveForm } from "../actions";

type Initial = { id: string; name: string; slug: string; active: boolean; destination: "crm_lead" | "project" | "responses_only"; target: string; fields: Item[]; settings: FormSettings };
const pick = (names: string[]) => formSettingsFields.filter((f) => names.includes(f.name)) as Field[];
const NO_MEDIA = { media: [], forms: [] };

export function FormEditor({ initial, stats, site, message, targets }: {
  targets: { projects: { id: string; name: string }[]; clients: { id: string; name: string }[] };
  initial: Initial; stats: { submissions: number; starts: number; completion: number | null }; site: string; message: { kind: "ok" | "err"; text: string } | null;
}) {
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [active, setActive] = useState(initial.active);
  const [destination, setDestination] = useState(initial.destination);
  const [target, setTarget] = useState(initial.target);
  const [items, setItems] = useState<Item[]>(initial.fields);
  const [settings, setSettings] = useState<Record<string, unknown>>(initial.settings as never);
  const data = JSON.stringify({ id: initial.id, name, slug, active, destination, target, fields: items, settings });

  const optionLabel = (i: Item) => `${lt(i.data.label, "ca") || formTypeByName[i.type].label}`;
  const summary = (i: Item) => {
    if (i.type === "pagebreak") return "Salt de pàgina";
    if (!formTypeByName[i.type].input) return `${formTypeByName[i.type].label.split(" (")[0]}${i.data.showField ? " · condicional" : ""}`;
    const bits = [formTypeByName[i.type].label, i.data.required === "yes" ? "obligatori" : "opcional"];
    if (i.data.showField) bits.push("condicional");
    return bits.join(" · ");
  };

  return (
    <form action={saveForm}>
      <input type="hidden" name="id" value={initial.id} />
      <input type="hidden" name="data" value={data} />
      <div className="top">
        <div>
          <div className="crumb"><Link href="/admin/forms">Formularis</Link></div>
          <h1>{name || "Formulari"}</h1>
        </div>
        <div className="row">
          <span className={active ? "chip ok" : "chip"}>{active ? `Actiu · ${stats.submissions} respostes` : "Tancat"}</span>
          <button className="btn primary" type="submit">Desa</button>
        </div>
      </div>

      <div className="body">
        {message && <p role="status" className={`msg ${message.kind}`} style={{ marginTop: 0 }}>{message.text}</p>}
        <div className="cols">
          <div className="col-main">
            <div className="card">
              <label>Nom intern<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
              <label>Enllaç (slug)<input value={slug} onChange={(e) => setSlug(e.target.value)} /></label>
              <label style={{ gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 10 }}>
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 18 }} />
                <span>Obert: accepta respostes</span>
              </label>
            </div>

            <ListEditor
              items={items}
              onChange={setItems}
              title={(i) => (i.type === "pagebreak" ? "Salt de pàgina" : summary(i))}
              render={(item, update, index) => (
                <FieldForm
                  fields={formTypeByName[item.type].fields}
                  data={item.data}
                  onChange={(d) => update({ ...item, data: d })}
                  options={{ ...NO_MEDIA, earlier: items.slice(0, index).filter((x) => formTypeByName[x.type].input).map((x) => ({ id: x.id, label: optionLabel(x) })) }}
                />
              )}
              add={{
                label: "Afegeix un camp",
                options: formTypeDefs.map((d) => ({ value: d.name, label: d.label })),
                make: (type) => ({ id: crypto.randomUUID(), type, data: emptyData(formTypeByName[type].fields) }),
              }}
            />
          </div>

          <aside className="col-side">
            <fieldset className="card" style={{ border: "1px solid var(--line)" }}>
              <legend style={{ display: "none" }}>Destinació</legend>
              <h3>Destinació de les respostes</h3>
              {([["crm_lead", "Crear contacte i lead al CRM"], ["project", "Adjuntar a un projecte o client"], ["responses_only", "Només recollir respostes"]] as const).map(([v, l]) => (
                <label key={v} style={{ gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 10, color: "var(--ink)", fontSize: 13 }}>
                  <input type="radio" name="dest" checked={destination === v} onChange={() => setDestination(v)} style={{ width: 16 }} /><span>{l}</span>
                </label>
              ))}
              {destination === "project" && (
                <label>Adjunta les respostes a
                  <select value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">— tria —</option>
                    <optgroup label="Projectes">{targets.projects.map((p) => <option key={p.id} value={`project:${p.id}`}>{p.name}</option>)}</optgroup>
                    <optgroup label="Clients">{targets.clients.map((c) => <option key={c.id} value={`client:${c.id}`}>{c.name}</option>)}</optgroup>
                  </select>
                </label>
              )}
            </fieldset>

            <div className="card"><h3>Text públic</h3><FieldForm fields={pick(["title", "confirmation", "consent"])} data={settings} onChange={setSettings} options={NO_MEDIA} /></div>
            <div className="card"><h3>Butlletí</h3><FieldForm fields={pick(["newsletterEnabled", "newsletterText"])} data={settings} onChange={setSettings} options={NO_MEDIA} /></div>
            <div className="card"><h3>Notificacions</h3><FieldForm fields={pick(["staffEmail", "staffAddresses", "confirmToSender", "confirmSubject", "confirmBody"])} data={settings} onChange={setSettings} options={NO_MEDIA} /></div>

            <div className="card">
              <h3>Respostes</h3>
              <div className="row"><span className="hint">Enviaments</span><strong>{stats.submissions}</strong></div>
              <div className="row"><span className="hint">Han començat a omplir-lo</span><strong>{stats.starts}</strong></div>
              <div className="row"><span className="hint">Taxa de finalització</span><strong>{stats.completion === null ? "—" : `${Math.round(stats.completion * 100)}%`}</strong></div>
              <Link href={`/admin/forms/${initial.id}/submissions`} className="btn" style={{ textAlign: "center" }}>Veure les respostes</Link>
              <a href={`/admin/forms/${initial.id}/export`} style={{ color: "var(--accent)", fontWeight: 600, fontSize: 13 }}>Exporta com a full de càlcul (CSV) →</a>
            </div>

            <div className="card">
              <h3>Comparteix</h3>
              {(["ca", "es", "en"] as const).map((l) => (
                <div key={l} style={{ display: "grid", gap: 4 }}>
                  <span className="hint">{l.toUpperCase()} · enllaç</span>
                  <input readOnly aria-label={`Enllaç ${l}`} value={`${site}/${l}/form/${slug}`} onFocus={(e) => e.currentTarget.select()} />
                  <span className="hint">{l.toUpperCase()} · codi per incrustar</span>
                  <textarea readOnly aria-label={`Codi ${l}`} style={{ minHeight: 64, fontSize: 12 }} onFocus={(e) => e.currentTarget.select()}
                    value={`<iframe src="${site}/embed/${l}/form/${slug}" title="${name.replace(/"/g, "'")}" width="100%" height="700" style="border:0" loading="lazy"></iframe>`} />
                </div>
              ))}
              <span className="hint">Els formularis també es poden posar dins d&apos;una pàgina amb la secció «Formulari».</span>
            </div>

            <div className="card">
              <button className="btn" type="submit" formAction={copyForm} formNoValidate>Duplica el formulari</button>
              <span className="hint">Fa una còpia tancada, sense respostes, de l&apos;última versió desada.</span>
              <button className="btn link" type="submit" formAction={removeForm} formNoValidate
                onClick={(e) => { if (!confirm("Eliminaràs el formulari i TOTES les seves respostes (i els arxius adjunts). Segur?")) e.preventDefault(); }}>
                Elimina el formulari
              </button>
            </div>
          </aside>
        </div>
      </div>
    </form>
  );
}
