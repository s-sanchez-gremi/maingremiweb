"use client";
import { useState } from "react";
import { FieldForm, type Options } from "@apex/ui/components/FieldForm";
import { settingsFields } from "@/lib/settings-schema";
import { saveSettings } from "./actions";

// One settings record, shown as short tabs instead of one long page. Every tab edits the same data and one Desa saves it all.
const TABS = [
  { id: "general", label: "General", fields: ["homepage", "phone", "email", "seoTitle", "seoDescription"] },
  { id: "menu", label: "Menú principal", fields: ["nav"] },
  { id: "buttons", label: "Botons de dalt", fields: ["headerButtons"] },
  { id: "social", label: "Xarxes socials", fields: ["social"] },
  { id: "footer", label: "Peu de pàgina", fields: ["footerText", "footerColumns", "legalLinks"] },
] as const;
type TabId = (typeof TABS)[number]["id"];
const LANGS = ["ca", "es", "en"] as const;
type Lang = (typeof LANGS)[number];

/** How many translated texts have Catalan but are still empty in `lang`. */
function missing(v: unknown, lang: Lang): number {
  if (Array.isArray(v)) return v.reduce((n, x) => n + missing(x, lang), 0);
  if (!v || typeof v !== "object") return 0;
  const o = v as Record<string, unknown>;
  if (typeof o.ca === "string" && "es" in o && "en" in o) return o.ca.trim() && !String(o[lang] ?? "").trim() ? 1 : 0;
  return Object.values(o).reduce<number>((n, x) => n + missing(x, lang), 0);
}

type Data = Record<string, unknown>;
type Btn = { label?: Partial<Record<Lang, string>>; style?: string };

function HeaderPreview({ data, lang }: { data: Data; lang: Lang }) {
  const text = (l?: Partial<Record<Lang, string>>) => l?.[lang] || l?.ca || "";
  const nav = ((data.nav as { label?: Partial<Record<Lang, string>> }[]) ?? []).map((n) => text(n.label)).filter(Boolean);
  const buttons = (data.headerButtons as Btn[]) ?? [];
  return (
    <div className="preview-head" aria-label="Vista prèvia de la capçalera" role="img">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/gremi-logo.png" alt="" />
      <ul>{nav.map((n, i) => <li key={i}>{n}</li>)}</ul>
      {buttons.map((b, i) => text(b.label) && <span key={i} className={`pb ${b.style === "primary" ? "primary" : ""}`}>{text(b.label)}</span>)}
    </div>
  );
}

export function SettingsEditor({ initial, options, message, tab: firstTab }: {
  initial: Data; options: Options; message: { kind: "ok" | "err"; text: string } | null; tab: string;
}) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === firstTab) ? (firstTab as TabId) : "general");
  const [lang, setLang] = useState<Lang>("ca");
  const current = TABS.find((t) => t.id === tab)!;
  const fields = settingsFields.filter((f) => (current.fields as readonly string[]).includes(f.name));
  const pick = (id: TabId) => {
    setTab(id);
    window.history.replaceState(null, "", id === "general" ? "/admin/settings" : `/admin/settings?tab=${id}`);
  };
  return (
    <form action={saveSettings}>
      <input type="hidden" name="data" value={JSON.stringify(data)} />
      <input type="hidden" name="tab" value={tab} />
      <div className="top">
        <div>
          <div className="crumb">Web</div>
          <h1>Configuració del web</h1>
          <p className="lede">Menú, botons, xarxes i peu: el que es veu a totes les pàgines.</p>
        </div>
        <button className="btn primary" type="submit">Desa els canvis</button>
      </div>
      <div className="tabs" role="tablist" aria-label="Seccions de la configuració">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-controls="settings-panel" aria-selected={t.id === tab} onClick={() => pick(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="body">
        {message && <p role="status" className={`msg ${message.kind}`} style={{ marginTop: 0 }}>{message.text}</p>}
        <div className="settings-grid">
          <div role="tabpanel" id="settings-panel" aria-labelledby={`tab-${tab}`} style={{ display: "grid", gap: 16 }}>
            <div className="langswitch">
              <span id="lang-l">Idioma dels textos</span>
              <div role="group" aria-labelledby="lang-l">
                {LANGS.map((l) => {
                  const m = l === "ca" ? 0 : missing(data, l);
                  return (
                    <button key={l} type="button" aria-pressed={l === lang} onClick={() => setLang(l)}>
                      {l.toUpperCase()}{m > 0 && <span className="missing" aria-label={`, ${m} textos sense traduir`}> •{m}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            {(tab === "menu" || tab === "buttons") && <HeaderPreview data={data} lang={lang} />}
            <div className="card">
              <FieldForm fields={fields} data={data} onChange={setData} options={options} lang={lang} />
            </div>
          </div>
          <aside className="note">
            Desa els canvis i la web s&apos;actualitza en menys d&apos;un segon. Els textos s&apos;escriuen idioma per idioma: tria CA, ES o EN a dalt. El punt vermell diu quants textos falten per traduir.
          </aside>
        </div>
      </div>
    </form>
  );
}
