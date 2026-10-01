import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { entries, entryTranslations, locales } from "@/db/schema";
import { createEntry } from "./actions";

const statusClass = { published: "chip ok", scheduled: "chip sched", draft: "chip" } as const;
const statusLabel = { published: "Publicat", scheduled: "Programat", draft: "Esborrany" } as const;

export default async function ContentList({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const type = (await searchParams).type === "page" ? "page" : "post";
  const list = await db.select().from(entries).where(eq(entries.type, type)).orderBy(desc(entries.createdAt));
  const trs = list.length
    ? await db.select().from(entryTranslations).where(inArray(entryTranslations.entryId, list.map((e) => e.id)))
    : [];
  const noun = type === "post" ? "article" : "pàgina";
  const newLabel = type === "post" ? "Nou article" : "Nova pàgina"; // grammatical gender

  return (
    <>
      <div className="top">
        <div>
          <div className="crumb">Contingut</div>
          <h1>{type === "post" ? "Articles" : "Pàgines"}</h1>
        </div>
        <form action={createEntry}>
          <input type="hidden" name="type" value={type} />
          <button className="btn primary" type="submit">{newLabel}</button>
        </form>
      </div>
      <div className="body">
        {list.length === 0 ? <p className="hint">Encara no hi ha cap {noun}.</p> : (
          <table>
            <thead><tr><th>Títol</th>{locales.map((l) => <th key={l}>{l.toUpperCase()}</th>)}</tr></thead>
            <tbody>
              {list.map((e) => {
                const mine = trs.filter((t) => t.entryId === e.id);
                const first = mine.find((t) => t.locale === "ca") ?? mine[0];
                return (
                  <tr key={e.id}>
                    <td><Link href={`/admin/content/${e.id}?locale=${first?.locale ?? "ca"}`}><strong>{first?.title || "(sense títol)"}</strong></Link></td>
                    {locales.map((l) => {
                      const t = mine.find((x) => x.locale === l);
                      return <td key={l}>{t ? <span className={statusClass[t.status]}>{statusLabel[t.status]}</span> : <span className="hint">—</span>}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
