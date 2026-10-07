import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@apex/db";
import { forms } from "@apex/db/schema";
import { formStats } from "@apex/forms/admin-data";
import { outboxCounts } from "@apex/core/outbox";
import { copyForm, createForm } from "./actions";
import { formTemplates } from "@/lib/form-templates";
import { stateOf } from "@apex/forms/availability";

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
        <form action={createForm} className="card" aria-labelledby="templates-title">
          <h3 id="templates-title">Comença des d&apos;una plantilla</h3>
          <p className="hint" style={{ margin: 0 }}>Crea un formulari tancat amb els camps ja preparats; després el pots editar tot. Revisa el text de consentiment abans d&apos;obrir-lo.</p>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {formTemplates.map((t) => (
              <div key={t.key} style={{ display: "grid", gap: 4, alignContent: "start" }}>
                <button className="btn" type="submit" name="template" value={t.key}>{t.name}</button>
                <span className="hint">{t.description}</span>
              </div>
            ))}
          </div>
        </form>
        {list.length === 0 ? <p className="hint">Encara no hi ha cap formulari.</p> : (
          <table>
            <thead><tr><th>Nom</th><th>Destinació</th><th>Respostes</th><th>Taxa de finalització</th><th>Estat</th><th><span className="sr-only">Accions</span></th></tr></thead>
            <tbody>
              {list.map((f, i) => (
                <tr key={f.id}>
                  <td><Link href={`/admin/forms/${f.id}`}><strong>{f.name}</strong></Link></td>
                  <td>{dest[f.destination]}</td>
                  <td><Link href={`/admin/forms/${f.id}/submissions`}>{stats[i].submissions}</Link></td>
                  <td>{stats[i].completion === null ? "—" : `${Math.round(stats[i].completion! * 100)}%`}</td>
                  <td>{(() => { const st = stateOf(f, stats[i].submissions); return <span className={st === "open" ? "chip ok" : "chip"}>{{ open: "Actiu", closed: "Tancat", expired: "Tancat per data", full: "Complet" }[st]}</span>; })()}</td>
                  <td>
                    <form action={copyForm}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="btn link" type="submit" aria-label={`Duplica el formulari ${f.name}`}>Duplica</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
