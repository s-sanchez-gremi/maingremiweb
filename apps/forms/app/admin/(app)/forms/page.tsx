import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@apex/db";
import { forms, submissions } from "@apex/db/schema";
import { formStats } from "@apex/forms/admin-data";
import { outboxCounts } from "@apex/core/outbox";
import { EmptyState } from "@apex/ui/components/Identity";
import { copyForm, createForm } from "./actions";
import { formTemplates } from "@/lib/form-templates";
import { stateOf } from "@apex/forms/availability";

const dest = { crm_lead: "Contacte + lead al CRM", project: "Projecte / client", records: "Registres al CRM", responses_only: "Només respostes" } as const;

export default async function FormsPage() {
  const list = await db.select().from(forms).orderBy(desc(forms.createdAt));
  const stats = await Promise.all(list.map((f) => formStats(f.id)));
  const mail = await outboxCounts();
  // responses of forms that create CRM records which the CRM could not process: staff must look at them
  const failedRows = await db.select({ formId: submissions.formId, n: count() }).from(submissions).where(eq(submissions.routingStatus, "failed")).groupBy(submissions.formId);
  const failed = new Map(failedRows.map((r) => [r.formId, r.n]));
  const failedTotal = failedRows.reduce((a, r) => a + r.n, 0);
  return (
    <>
      <div className="top">
        <div><div className="crumb">Formularis</div><h1>Formularis</h1></div>
        <form action={createForm}><button className="btn primary" type="submit">Nou formulari</button></form>
      </div>
      <div className="body" style={{ display: "grid", gap: 16 }}>
        {mail.dead > 0 && <p role="alert" className="msg err">{mail.dead} correu(s) no s&apos;han pogut enviar després de diversos intents. Revisa la configuració del correu.</p>}
        {failedTotal > 0 && <p role="alert" className="msg err">{failedTotal} resposta(es) no s&apos;han pogut passar al CRM. Obre les respostes del formulari marcat amb ⚠ per veure per què i tornar-ho a provar.</p>}
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
        {list.length === 0 ? <EmptyState eyebrow="Formularis" title="Encara no hi ha cap formulari">Tria una plantilla de dalt per començar. Els formularis que creïs apareixeran aquí amb les respostes i la taxa de finalització.</EmptyState> : (
          <table>
            <thead><tr><th>Nom</th><th>Destinació</th><th>Respostes</th><th>Taxa de finalització</th><th>Estat</th><th><span className="sr-only">Accions</span></th></tr></thead>
            <tbody>
              {list.map((f, i) => (
                <tr key={f.id}>
                  <td><Link href={`/admin/forms/${f.id}`}><strong>{f.name}</strong></Link></td>
                  <td>{dest[f.destination]}</td>
                  <td><Link href={`/admin/forms/${f.id}/submissions`}>{stats[i].submissions}</Link>{failed.get(f.id) ? <span title="Respostes que no s'han pogut passar al CRM"> ⚠ {failed.get(f.id)}</span> : null}</td>
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
