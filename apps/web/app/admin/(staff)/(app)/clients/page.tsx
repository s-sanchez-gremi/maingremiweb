import Link from "next/link";
import { asc, count, eq, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { clients, projects } from "@apex/db/schema";
import { ListSearch } from "@apex/ui/components/ListSearch";
import { matchAll } from "@apex/core/search";
import { createClient } from "./actions";

export default async function Clients({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string; q?: string }> }) {
  const sp = await searchParams;
  const rows = await db.select({ c: clients, n: count(projects.id) }).from(clients).leftJoin(projects, eq(projects.clientId, clients.id)).where(matchAll(sql`${clients.name} || ' ' || ${clients.email} || ' ' || ${clients.phone} || ' ' || ${clients.notes}`, sp.q)).groupBy(clients.id).orderBy(asc(clients.name));
  return (
    <>
      <div className="top"><div><div className="crumb">Projectes</div><h1>Clients</h1></div></div>
      <div className="body">
        {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
        {sp.deleted && <p role="status" className="msg ok">Client eliminat.</p>}
        <div className="cols">
          <div className="col-main">
            <ListSearch label="Cerca clients" placeholder="Nom, correu, telèfon o notes" q={sp.q} />
            {rows.length === 0 ? <p className="hint">{sp.q ? "Cap client coincideix." : "Encara no hi ha cap client."}</p> : (
              <table>
                <thead><tr><th>Nom</th><th>Contacte</th><th>Projectes</th></tr></thead>
                <tbody>{rows.map(({ c, n }) => <tr key={c.id}><td><Link href={`/admin/clients/${c.id}`}><strong>{c.name}</strong></Link></td><td className="hint">{[c.email, c.phone].filter(Boolean).join(" · ") || "—"}</td><td>{n}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <form action={createClient} className="card col-side">
            <h3>Nou client</h3>
            <label>Nom<input name="name" required /></label>
            <label>Correu<input name="email" type="email" /></label>
            <label>Telèfon<input name="phone" /></label>
            <button className="btn primary" type="submit">Crea el client</button>
          </form>
        </div>
      </div>
    </>
  );
}
