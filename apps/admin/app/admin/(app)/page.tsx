import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { entries, entryTranslations, errorLog, locales } from "@apex/db/schema";
import { requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { isFresh, lastBeat } from "@apex/core/heartbeat";
import { outboxCounts } from "@apex/core/outbox";
import { Icon } from "@/components/admin/icons";
import { ago, displayName, greeting, today } from "@/lib/admin-ui";
import { createEntry } from "./content/actions";

const statusLabel = { published: "Publicada", scheduled: "Programada", draft: "Esborrany" } as const;
const statusClass = { published: "chip ok", scheduled: "chip sched", draft: "chip draft" } as const;

export default async function Dashboard() {
  const me = await requireUser();
  const admin = can(me, "settings:write");
  const counts = await db.select({ status: entryTranslations.status, n: sql<number>`count(*)::int` })
    .from(entryTranslations).groupBy(entryTranslations.status);
  const n = (s: string) => counts.find((r) => r.status === s)?.n ?? 0;
  const perLocale = await db.select({ locale: entryTranslations.locale, n: sql<number>`count(*) filter (where ${entryTranslations.live} is not null)::int` })
    .from(entryTranslations).groupBy(entryTranslations.locale);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(entries);
  const live = (l: string) => perLocale.find((r) => r.locale === l)?.n ?? 0;
  const recent = await db.select({ id: entries.id, type: entries.type, locale: entryTranslations.locale, title: entryTranslations.title, status: entryTranslations.status, updatedAt: entryTranslations.updatedAt })
    .from(entryTranslations).innerJoin(entries, eq(entries.id, entryTranslations.entryId))
    .orderBy(desc(entryTranslations.updatedAt)).limit(6);
  const sys = admin ? { beat: await lastBeat(), mail: await outboxCounts(), errors: (await db.select({ n: sql<number>`count(*)::int` }).from(errorLog).where(sql`not resolved`))[0].n } : null;
  // On a laptop nothing calls the scheduler, so "stopped" there is expected, not a problem.
  const local = !["staging", "production"].includes(process.env.APP_ENV ?? "");
  const issues = sys ? [
    !isFresh(sys.beat) && (local ? null : "Les tasques automàtiques (publicació programada, correus) estan aturades."),
    sys.mail.dead > 0 && `${sys.mail.dead} correus no s'han pogut enviar.`,
    sys.errors > 0 && `${sys.errors} errors oberts.`,
  ].filter((x): x is string => !!x) : [];

  return (
    <>
      <div className="hello">
        <h1><span className="eyebrow">Tauler · {today()}</span>{greeting()}, {displayName(me)}</h1>
        <p className="lede">Què vols fer avui?</p>
      </div>
      <div className="body">
        <div className="quick">
          <form action={createEntry}><input type="hidden" name="type" value="page" />
            <button type="submit"><span className="ico red"><Icon name="newPage" size={22} /></span><span><strong>Nova pàgina</strong><small>Amb el constructor visual</small></span></button>
          </form>
          <form action={createEntry}><input type="hidden" name="type" value="post" />
            <button type="submit"><span className="ico ink"><Icon name="post" size={22} /></span><span><strong>Nou article</strong><small>Una notícia per al blog</small></span></button>
          </form>
          <Link href="/admin/media"><span className="ico"><Icon name="upload" size={22} /></span><span><strong>Puja fitxers</strong><small>Imatges, PDF, Word…</small></span></Link>
          {admin
            ? <Link href="/admin/settings?tab=menu"><span className="ico"><Icon name="menu" size={22} /></span><span><strong>Edita el menú</strong><small>I els botons de dalt</small></span></Link>
            : <a href={`${(process.env.SITE_URL ?? "").replace(/\/$/, "")}/ca`}><span className="ico"><Icon name="external" size={22} /></span><span><strong>Veure la web</strong><small>Tal com la veuen els visitants</small></span></a>}
        </div>

        <div className="dash">
          <section className="panel" aria-labelledby="recent-h">
            <div className="panel-head">
              <h2 id="recent-h">Continua on ho vas deixar</h2>
              <Link href="/admin/content?type=page">Totes les pàgines</Link>
            </div>
            <div className="recent">
              {recent.length === 0 && <p className="hint" style={{ padding: 20, margin: 0 }}>Encara no hi ha res. Comença amb una pàgina nova.</p>}
              {recent.map((r) => (
                <Link key={`${r.id}-${r.locale}`} href={`/admin/content/${r.id}?locale=${r.locale}`}>
                  <span className="kind"><Icon name={r.type === "page" ? "page" : "post"} /></span>
                  <span className="t">
                    <strong>{r.title || "(sense títol)"}</strong>
                    <span>{r.type === "page" ? "Pàgina" : "Article"} · {r.locale.toUpperCase()} · editat {ago(r.updatedAt)}</span>
                  </span>
                  <span className={statusClass[r.status]}>{statusLabel[r.status]}</span>
                </Link>
              ))}
            </div>
          </section>

          <div className="side-col">
            <section className="figures" aria-labelledby="fig-h">
              <h2 id="fig-h">La web en xifres</h2>
              <dl>
                <div><dt>publicades</dt><dd>{n("published")}</dd></div>
                <div><dt>esborranys</dt><dd>{n("draft")}</dd></div>
                <div><dt>programades</dt><dd>{n("scheduled")}</dd></div>
              </dl>
              <div className="cmyk" aria-hidden="true"><span style={{ background: "var(--cmyk-c)" }} /><span style={{ background: "var(--cmyk-m)" }} /><span style={{ background: "var(--cmyk-y)" }} /><span style={{ background: "var(--ink-text)" }} /></div>
            </section>

            <section className="panel langbars" aria-labelledby="lang-h">
              <h2 id="lang-h">Idiomes</h2>
              {locales.map((l) => (
                <div className="langbar" key={l}>
                  <b>{l.toUpperCase()}</b>
                  <span className="bar"><span style={{ width: `${total ? Math.round((live(l) / total) * 100) : 0}%` }} /></span>
                  <span>{live(l)} de {total}</span>
                </div>
              ))}
              {total > 0 && live("es") < live("ca") && <p className="hint" style={{ margin: 0 }}>{live("ca") - live("es")} continguts encara no estan publicats en castellà.</p>}
            </section>

            {sys && (
              <section className="panel health" aria-labelledby="sys-h">
                <h2 id="sys-h">Estat del sistema</h2>
                {issues.length === 0
                  ? <p style={{ margin: 0 }}><span className="dot" />La web funciona bé.</p>
                  : <ul>{issues.map((i) => <li key={i}><span className="dot bad" />{i}</li>)}</ul>}
                {local && !isFresh(sys.beat) && <p className="hint" style={{ margin: 0 }}>En aquest ordinador les tasques automàtiques no s&apos;executen; al servidor sí.</p>}
                {sys.errors > 0 && <Link className="btn" href="/admin/errors">Veure errors</Link>}
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
