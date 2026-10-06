"use client";
import Link from "next/link";
import { useState } from "react";
import { ListEditor } from "@apex/ui/components/ListEditor";
import { FieldForm, emptyData, type Options } from "@apex/ui/components/FieldForm";
import { sectionByName, sectionDefs } from "@apex/sections/registry";
import type { Field } from "@apex/core/fields";
import { VisualEditor } from "@/components/admin/builder/VisualEditor";
import type { SectionItem } from "@/lib/builder-ops";
import { deleteEntry, restoreEntryVersion, saveDraftSections, saveEntry } from "../actions";

type Opt = { id: string; label: string };
type Status = "draft" | "scheduled" | "published";
const statusLabel = { published: "Publicat", scheduled: "Programat", draft: "Esborrany" } as const;

export function EntryEditor(p: {
  entry: { id: string; type: "post" | "page"; theme: string; tags: string; publishedOn: string; categoryId: string; authorId: string; coverMediaId: string };
  locale: string;
  translation: { title: string; slug: string; sections: SectionItem[]; seo: { title?: string; description?: string }; status: Status; publishAt: string | null; exists: boolean; hasLive: boolean; dirty: boolean };
  langs: { code: string; status: Status | null }[];
  versions: { id: string; at: string; title: string }[];
  categories: Opt[]; authors: Opt[]; options: Options; previewBase: string;
  message: { kind: "err" | "ok"; text: string } | null;
}) {
  const [sections, setSections] = useState<SectionItem[]>(p.translation.sections);
  const t = p.translation;
  const isPost = p.entry.type === "post";
  const [mode, setMode] = useState<"visual" | "list">(isPost ? "list" : "visual"); // pages are built visually; articles are mostly text

  return (
    <form action={saveEntry}>
      <input type="hidden" name="id" value={p.entry.id} />
      <input type="hidden" name="locale" value={p.locale} />
      <input type="hidden" name="sections" value={JSON.stringify(sections)} />

      <div className="top">
        <div>
          <div className="crumb"><Link href={`/admin/content?type=${p.entry.type}`}>{isPost ? "Articles" : "Pàgines"}</Link> / {p.locale.toUpperCase()}</div>
          <h1>{t.title || "(sense títol)"}</h1>
        </div>
        <div className="row">
          <div className="b-devices" role="group" aria-label="Mode d'edició">
            <button type="button" className="btn" aria-pressed={mode === "visual"} onClick={() => setMode("visual")}>Editor visual</button>
            <button type="button" className="btn" aria-pressed={mode === "list"} onClick={() => setMode("list")}>Llista</button>
          </div>
          <span className={t.status === "published" ? "chip ok" : t.status === "scheduled" ? "chip sched" : "chip"}>{statusLabel[t.status]}</span>
          {t.hasLive && t.dirty && <span className="chip sched">Canvis sense publicar</span>}
          <button className="btn" type="submit" name="intent" value="save">Desa</button>
          <button className="btn primary" type="submit" name="intent" value="publish">Publica</button>
        </div>
      </div>

      <div className="body">
        {p.message && <p role="status" className={`msg ${p.message.kind}`} style={{ marginTop: 0 }}>{p.message.text}</p>}
        {mode === "visual" && (
          <VisualEditor entryId={p.entry.id} locale={p.locale} sections={sections} onChange={setSections} options={p.options} save={saveDraftSections} previewBase={p.previewBase} />
        )}
        <div className="cols">
          <div className="col-main">
            <div className="card">
              <label>Títol<input name="title" defaultValue={t.title} required /></label>
              <label>Slug (URL)<input name="slug" defaultValue={t.slug} /></label>
            </div>

            {mode === "list" && <ListEditor
              items={sections}
              onChange={setSections}
              title={(s) => sectionByName[s.type]?.label ?? s.type}
              render={(s, update) => (
                <FieldForm fields={sectionByName[s.type].fields as Field[]} data={s.data} onChange={(data) => update({ ...s, data })} options={p.options} />
              )}
              add={{
                options: sectionDefs.map((d) => ({ value: d.name, label: d.label })),
                make: (type) => ({ id: crypto.randomUUID(), type, data: emptyData(sectionByName[type].fields as Field[]) }),
              }}
            />}
          </div>

          <aside className="col-side">
            <div className="card">
              <h3>Idiomes</h3>
              <div className="langs">
                {p.langs.map((l) => (
                  <Link key={l.code} href={`/admin/content/${p.entry.id}?locale=${l.code}`} aria-current={l.code === p.locale ? "page" : undefined}>
                    {l.code.toUpperCase()}{l.status === "published" ? " ✓" : l.status === "scheduled" ? " ⏱" : ""}
                  </Link>
                ))}
              </div>
              {!t.exists && <p className="hint">Aquesta traducció encara no existeix. Desa per crear-la.</p>}
            </div>

            <div className="card">
              <h3>Publicació</h3>
              <label>Programa per a<input type="datetime-local" name="publishAt" defaultValue={t.publishAt ? t.publishAt.slice(0, 16) : ""} /></label>
              <button className="btn" type="submit" name="intent" value="schedule">Programa</button>
              {(t.hasLive || t.status === "scheduled") && <button className="btn" type="submit" name="intent" value="unpublish">Passa a esborrany</button>}
            </div>

            {p.versions.length > 0 && (
              <div className="card">
                <h3>Versions publicades</h3>
                <p className="hint">Restaurar ho copia a l&apos;esborrany (substitueix el que hi ha ara). No canvia el web fins que publiquis.</p>
                {p.versions.map((v) => (
                  <div className="row" key={v.id}>
                    <span>{new Date(v.at).toLocaleString("ca-ES", { dateStyle: "short", timeStyle: "short" })}</span>
                    <button className="btn link" type="submit" formAction={restoreEntryVersion.bind(null, v.id)} formNoValidate
                      onClick={(e) => { if (!confirm("Restaurar aquesta versió? Es perdran els canvis de l'esborrany actual.")) e.preventDefault(); }}>Restaura</button>
                  </div>
                ))}
              </div>
            )}

            <div className="card">
              <h3>Detalls</h3>
              {isPost && (
                <>
                  <label>Autor
                    <select name="authorId" defaultValue={p.entry.authorId}><option value="">—</option>{p.authors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
                  </label>
                  <label>Categoria
                    <select name="categoryId" defaultValue={p.entry.categoryId}><option value="">—</option>{p.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                  </label>
                  <label>Imatge de portada
                    <select name="coverMediaId" defaultValue={p.entry.coverMediaId}><option value="">—</option>{p.options.media.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
                  </label>
                  <label>Etiquetes (separades per comes)<input name="tags" defaultValue={p.entry.tags} /></label>
                  <label>Data de publicació<input type="date" name="publishedOn" defaultValue={p.entry.publishedOn} /></label>
                </>
              )}
              {!isPost && <label>Tema<input name="theme" defaultValue={p.entry.theme} /></label>}
            </div>

            <div className="card">
              <h3>SEO</h3>
              <label>Títol SEO<input name="seoTitle" defaultValue={t.seo.title ?? ""} /></label>
              <label>Descripció<textarea name="seoDescription" defaultValue={t.seo.description ?? ""} style={{ minHeight: 70 }} /></label>
            </div>

            <div className="card">
              <button className="btn link" type="submit" formAction={deleteEntry} formNoValidate
                onClick={(e) => { if (!confirm("Segur que vols eliminar aquest contingut en tots els idiomes?")) e.preventDefault(); }}>
                Elimina
              </button>
            </div>
          </aside>
        </div>
      </div>
    </form>
  );
}
