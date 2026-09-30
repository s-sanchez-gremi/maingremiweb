import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { contacts, forms, leads, submissions } from "@/db/schema";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { eraseContactAction } from "./actions";

// A plain read-only list. The full CRM screens are a later phase; this shows what the pipeline captured.
export default async function Leads({ searchParams }: { searchParams: Promise<{ erased?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const rows = await db.select({ l: leads, c: contacts, formName: forms.name, consentAt: submissions.consentAt, consentText: submissions.consentText })
    .from(leads).innerJoin(contacts, eq(contacts.id, leads.contactId)).leftJoin(forms, eq(forms.id, leads.formId)).innerJoin(submissions, eq(submissions.id, leads.submissionId))
    .orderBy(desc(leads.createdAt)).limit(200);
  return (
    <>
      <div className="top"><div><div className="crumb">Contactes</div><h1>Contactes i leads</h1></div></div>
      <div className="body" style={{ display: "grid", gap: 14 }}>
        {sp.erased && <p role="status" className="msg ok">Contacte i dades associades eliminats.</p>}
        {rows.length === 0 ? <p className="hint">Encara no hi ha cap lead.</p> : (
          <table>
            <thead><tr><th>Data</th><th>Contacte</th><th>Formulari</th><th>Origen</th><th>Consentiment</th>{can(me, "data:erase") && <th />}</tr></thead>
            <tbody>
              {rows.map(({ l, c, formName, consentAt, consentText }) => (
                <tr key={l.id}>
                  <td>{l.createdAt.toLocaleDateString("ca-ES")}</td>
                  <td><strong>{c.name || "—"}</strong><div className="hint">{c.email}{c.phone && ` · ${c.phone}`}{c.company && ` · ${c.company}`}</div></td>
                  <td>{l.formId ? <Link href={`/admin/forms/${l.formId}/submissions`}>{formName}</Link> : formName}</td>
                  <td>
                    <div>{l.sourcePath || "—"}</div>
                    <div className="hint">{[l.theme && `tema ${l.theme}`, l.locale.toUpperCase(), ...Object.entries(l.utm).map(([k, v]) => `${k}=${v}`)].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="hint" style={{ maxWidth: 260 }}>{consentAt ? `${consentAt.toLocaleDateString("ca-ES")}: «${consentText}»` : "—"}</td>
                  {can(me, "data:erase") && (
                    <td>
                      <form action={eraseContactAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <ConfirmButton className="btn link" message={`Eliminar ${c.email} i totes les seves dades (leads, respostes, arxius, butlletí)? No es pot desfer.`}>Elimina les dades</ConfirmButton>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
