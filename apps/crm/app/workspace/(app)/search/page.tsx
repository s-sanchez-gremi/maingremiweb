import Link from "next/link";
import { requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { listRecords } from "@/lib/records/engine";
import { ENTITIES } from "@/lib/records/registry";

// One search over every database the person may use (the engine's own per-entity search, a few hits each).
export default async function WorkspaceSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const entities = Object.values(ENTITIES).filter((e) => !e.hidden && e.search?.length && can(user, e.perm));
  const results = q ? await Promise.all(entities.map(async (e) => ({ e, ...(await listRecords(e, { q })) }))) : [];
  const found = results.filter((r) => r.total > 0);
  return (
    <div className="ws-content" style={{ maxWidth: 860 }}>
      <header className="ws-head"><h1>Cerca</h1></header>
      {!q && <p className="ws-hint">Escriu a la caixa de l&apos;esquerra per cercar a empreses, persones, esdeveniments, visites…</p>}
      {q && found.length === 0 && <p className="ws-hint">Cap resultat per a «{q}».</p>}
      {found.map(({ e, rows, total }) => (
        <section key={e.key} className="card" style={{ marginBottom: 12 }} aria-label={e.title}>
          <h3><Link href={`/workspace/${e.key}?q=${encodeURIComponent(q)}`}>{e.title}</Link> <span className="hint">({total})</span></h3>
          <ul>{rows.slice(0, 6).map((r) => <li key={r.id}>{e.detail ? <Link href={`/workspace/${e.key}?open=${r.id}`}>{e.summary(r)}</Link> : e.summary(r)}</li>)}</ul>
          {total > 6 && <Link href={`/workspace/${e.key}?q=${encodeURIComponent(q)}`}>Veure’ls tots</Link>}
        </section>
      ))}
    </div>
  );
}
