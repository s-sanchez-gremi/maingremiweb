import Link from "next/link";
import { EmptyState } from "@apex/ui/components/Identity";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@apex/db";
import { entries, entryTranslations, locales } from "@apex/db/schema";
import { ListSearch } from "@apex/ui/components/ListSearch";
import { ago } from "@/lib/admin-ui";
import { createEntry } from "./actions";

const statusClass = { published: "chip ok", scheduled: "chip sched", draft: "chip draft" } as const;
const statusLabel = { published: "Publicat", scheduled: "Programat", draft: "Esborrany" } as const;
const FILTERS = { all: "Tots", published: "Publicats", draft: "Esborranys", scheduled: "Programats" } as const;
type F = keyof typeof FILTERS;
type Status = keyof typeof statusLabel;

// Accent- and case-insensitive, every word must match (same rule as the site search).
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ·]/g, "").toLowerCase();
const matches = (title: string, q: string) => fold(q).split(/\s+/).filter(Boolean).every((w) => fold(title).includes(w));

export default async function ContentList({ searchParams }: { searchParams: Promise<{ type?: string; q?: string; s?: string }> }) {
  const sp = await searchParams;
  const type = sp.type === "page" ? "page" : "post";
  const q = sp.q?.trim() ?? "";
  const f: F = sp.s && sp.s in FILTERS ? (sp.s as F) : "all";
  const list = await db.select().from(entries).where(eq(entries.type, type)).orderBy(desc(entries.createdAt));
  const trs = list.length
    ? await db.select().from(entryTranslations).where(inArray(entryTranslations.entryId, list.map((e) => e.id)))
    : [];
  const rows = list.map((e) => {
    const mine = trs.filter((t) => t.entryId === e.id);
    const main = mine.find((t) => t.locale === "ca") ?? mine[0];
    const updated = new Date(Math.max(...mine.map((t) => t.updatedAt.getTime()), e.createdAt.getTime()));
    return { e, mine, main, updated, statuses: new Set<Status>(mine.map((t) => t.status)) };
  }).sort((a, b) => b.updated.getTime() - a.updated.getTime());
  const searched = q ? rows.filter((r) => r.mine.some((t) => matches(t.title, q))) : rows;
  const count = (k: F) => k === "all" ? searched.length : searched.filter((r) => r.statuses.has(k)).length;
  const shown = f === "all" ? searched : searched.filter((r) => r.statuses.has(f));

  const plural = type === "post" ? "articles" : "pàgines";
  const newLabel = type === "post" ? "Nou article" : "Nova pàgina"; // grammatical gender
  const href = (k: F) => `/admin/content?${new URLSearchParams({ type, ...(q ? { q } : {}), ...(k === "all" ? {} : { s: k }) })}`;
  const publicPath = (slug: string) => type === "post" ? `/ca/blog/${slug}` : `/ca/${slug}`;

  return (
    <>
      <div className="top">
        <div>
          <div className="crumb">Contingut</div>
          <h1>{type === "post" ? "Articles" : "Pàgines"}</h1>
          <p className="lede">{rows.length} {plural} a la web</p>
        </div>
        <form action={createEntry}>
          <input type="hidden" name="type" value={type} />
          <button className="btn primary" type="submit">+ {newLabel}</button>
        </form>
      </div>
      <div className="body" style={{ display: "grid", gap: 16 }}>
        <ListSearch label={`Cerca ${plural}`} placeholder="Cerca per títol…" q={q} hidden={{ type, ...(f === "all" ? {} : { s: f }) }} />
        <nav className="filters" aria-label="Filtra per estat">
          {(Object.keys(FILTERS) as F[]).map((k) => (
            <Link key={k} href={href(k)} aria-current={k === f ? "page" : undefined}>{FILTERS[k]} · {count(k)}</Link>
          ))}
        </nav>
        {shown.length === 0 ? (
          rows.length === 0
            ? <EmptyState eyebrow={type === "post" ? "Articles" : "Pàgines"} title={`Encara no hi ha cap ${type === "post" ? "article" : "pàgina"}`}>Fes servir el botó Crea del menú per començar. Quan en publiquis una, la veuràs aquí amb les llengües en què ja és visible.</EmptyState>
            : <p className="hint">No hi ha res que coincideixi.</p>
        ) : (
          <div className="entries" role="table" aria-label={type === "post" ? "Articles" : "Pàgines"}>
            <div className="entry head" role="row">
              <span role="columnheader">Títol</span><span role="columnheader">Idiomes</span><span role="columnheader">Última edició</span><span role="columnheader">Estat</span><span role="columnheader"><span className="sr-only">Accions</span></span>
            </div>
            {shown.map(({ e, mine, main, updated }) => {
              const title = main?.title || "(sense títol)";
              const editHref = `/admin/content/${e.id}?locale=${main?.locale ?? "ca"}`;
              const live = mine.find((t) => t.locale === "ca" && t.live);
              return (
                <div className="entry" role="row" key={e.id}>
                  <span className="title" role="cell">
                    <Link href={editHref}>{title}</Link>
                    <span>{main ? publicPath(main.slug) : ""}</span>
                  </span>
                  <span className="langs-mini" role="cell">
                    {locales.map((l) => {
                      const t = mine.find((x) => x.locale === l);
                      const cls = !t ? "none" : t.live ? "live" : "draft";
                      const what = !t ? "sense traduir" : t.live ? "publicat" : statusLabel[t.status].toLowerCase();
                      return <span key={l} className={cls} title={`${l.toUpperCase()}: ${what}`}>{l.toUpperCase()}<span className="sr-only">: {what}</span></span>;
                    })}
                  </span>
                  <span className="when" role="cell">{ago(updated)}</span>
                  <span role="cell">{main && <span className={statusClass[main.status]}>{statusLabel[main.status]}</span>}</span>
                  <span className="acts" role="cell">
                    <Link className="btn" href={editHref} aria-label={`Edita: ${title}`}>Edita</Link>
                    {live && <Link className="btn" href={publicPath(live.live!.slug)} aria-label={`Veure a la web: ${title}`}>Veure</Link>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
