import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { forms } from "@/db/schema";
import { formStats } from "@/lib/forms/admin-data";
import { outboxCounts } from "@/lib/outbox";
import { createForm } from "./actions";

const dest = { crm_lead: "Contacte + lead al CRM", project: "Projecte / client", responses_only: "Només respostes" } as const;

export default async function FormsPage() {
  const list = await db.select().from(forms).orderBy(desc(forms.createdAt));
  const stats = await Promise.all(list.map((f) => formStats(f.id)));
  const mail = await outboxCounts();
  return (
    <>
      <div className="top">
        <div><div className="crumb">Formularis</div><h1>Formularis</h1></div>
        <form action={createForm}><button className="btn primary" type="submit">Nou formulari</button></form>
      </div>
      <div className="body" style={{ display: "grid", gap: 16 }}>
        {mail.dead > 0 && <p role="alert" className="msg err">{mail.dead} correu(s) no s&apos;han pogut enviar després de diversos intents. Revisa la configuració del correu.</p>}
        {mail.pending > 0 && <p className="hint">{mail.pending} correu(s) pendents d&apos;enviar (es reintenten automàticament).</p>}
        {list.length === 0 ? <p className="hint">Encara no hi ha cap formulari.</p> : (
          <table>
            <thead><tr><th>Nom</th><th>Destinació</th><th>Respostes</th><th>Taxa de finalització</th><th>Estat</th></tr></thead>
            <tbody>
              {list.map((f, i) => (
                <tr key={f.id}>
                  <td><Link href={`/admin/forms/${f.id}`}><strong>{f.name}</strong></Link></td>
                  <td>{dest[f.destination]}</td>
                  <td><Link href={`/admin/forms/${f.id}/submissions`}>{stats[i].submissions}</Link></td>
                  <td>{stats[i].completion === null ? "—" : `${Math.round(stats[i].completion! * 100)}%`}</td>
                  <td><span className={f.active ? "chip ok" : "chip"}>{f.active ? "Actiu" : "Tancat"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
