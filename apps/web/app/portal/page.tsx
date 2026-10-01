import { redirect } from "next/navigation";
import { requirePortalUser, destroyPortalSession } from "@/lib/portal-auth";
import { projectsOf, sharedDocuments } from "@/lib/portal";
import { db } from "@apex/db";
import { clients } from "@apex/db/schema";
import { eq } from "drizzle-orm";

const label = { active: "Actiu", paused: "En pausa", done: "Acabat" } as const;

async function logout() {
  "use server";
  await destroyPortalSession();
  redirect("/portal/login");
}

export default async function Portal() {
  const me = await requirePortalUser();
  const [[client], projs, docs] = await Promise.all([db.select({ name: clients.name }).from(clients).where(eq(clients.id, me.clientId)), projectsOf(me.clientId), sharedDocuments(me.clientId)]);
  return (
    <>
      <div className="row"><div className="brand">APEX</div><form action={logout}><button className="btn" type="submit">Surt</button></form></div>
      <h1>{client?.name ?? "Portal de clients"}</h1>
      <p className="hint">Sessió iniciada com a {me.email}</p>
      <h2>Els teus projectes</h2>
      {projs.length === 0 && <p className="hint">Encara no hi ha cap projecte.</p>}
      {projs.map((p) => {
        const mine = docs.filter((d) => d.projectId === p.id);
        return (
          <section key={p.id} className="card" aria-labelledby={`p-${p.id}`}>
            <div className="row"><h3 id={`p-${p.id}`} style={{ margin: 0 }}>{p.name}</h3><span className="chip">{label[p.status]}</span></div>
            {mine.length === 0 ? <p className="hint">Cap document compartit.</p> : (
              <ul>
                {mine.map(({ d }) => (
                  <li key={d.id}>
                    {d.kind === "file" ? <a href={`/portal/file/${d.id}`}>{d.title}</a> : <a href={d.url ?? "#"} target="_blank" rel="noopener noreferrer">{d.title}</a>}
                    <span className="hint"> · {d.kind === "file" ? `${d.fileName} (${Math.max(1, Math.round((d.size ?? 0) / 1024))} KB)` : "enllaç"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
