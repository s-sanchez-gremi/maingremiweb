import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@apex/db";
import { requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { ConfirmButton } from "@apex/ui/components/ConfirmButton";
import { clients, contacts, forms, leadNotes, leads, submissions, users, type Answer } from "@apex/db/schema";
import { LEAD_STATUSES, statusLabel } from "@/lib/leads";
import { addLeadNote, convertLead, eraseContactAction, saveLead } from "../actions";

const answerText = (a: Answer) => {
  const v = a.value as unknown;
  if (a.type === "file" && v && typeof v === "object") return (v as { name?: string }).name ?? "";
  return Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Sí" : "No") : String(v ?? "");
};

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [r] = await db.select({ l: leads, c: contacts, s: submissions, formName: forms.name }).from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId)).innerJoin(submissions, eq(submissions.id, leads.submissionId)).leftJoin(forms, eq(forms.id, leads.formId)).where(eq(leads.id, id));
  if (!r) notFound();
  const [notes, staff, [client], others] = await Promise.all([
    db.select({ n: leadNotes, by: users.email }).from(leadNotes).leftJoin(users, eq(users.id, leadNotes.authorId)).where(eq(leadNotes.leadId, id)).orderBy(desc(leadNotes.createdAt)),
    db.select({ id: users.id, email: users.email }).from(users).orderBy(asc(users.email)),
    db.select({ id: clients.id }).from(clients).where(eq(clients.contactId, r.c.id)),
    db.select({ id: leads.id, at: leads.createdAt, status: leads.status }).from(leads).where(eq(leads.contactId, r.c.id)).orderBy(desc(leads.createdAt)),
  ]);
  const { l, c, s } = r;
  return (
    <>
      <div className="top"><div><div className="crumb"><Link href="/admin/leads">Contactes</Link></div><h1>{c.name || c.email}</h1></div></div>
      <div className="body">
        {sp.saved && <p role="status" className="msg ok">{sp.saved === "note" ? "Nota afegida." : "Desat."}</p>}
        {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
        <div className="cols">
          <div className="col-main">
            <div className="card">
              <h3>Contacte</h3>
              <div>{c.email}{c.phone && ` · ${c.phone}`}{c.company && ` · ${c.company}`}</div>
              <div className="hint">{r.formName ?? "—"} · {l.createdAt.toLocaleString("ca-ES", { dateStyle: "medium", timeStyle: "short" })} · {l.sourcePath || "—"} · {l.locale.toUpperCase()}
                {Object.entries(l.utm).map(([k, v]) => ` · ${k}=${v}`).join("")}</div>
            </div>
            <div className="card">
              <h3>Respostes</h3>
              {s.answers.map((a) => <div key={a.id} style={{ overflowWrap: "anywhere" }}><strong>{a.label}:</strong> {answerText(a) || "—"}</div>)}
              <p className="hint">{s.consentAt ? `Consentiment ${s.consentAt.toLocaleDateString("ca-ES")}: «${s.consentText}»` : "Sense consentiment registrat."}</p>
            </div>
            <div className="card">
              <h3>Notes</h3>
              <form action={addLeadNote} style={{ display: "grid", gap: 8 }}>
                <input type="hidden" name="id" value={id} />
                <label>Nova nota<textarea name="body" required maxLength={5000} /></label>
                <button className="btn primary" type="submit">Afegeix la nota</button>
              </form>
              {notes.length === 0 && <p className="hint">Encara no hi ha notes.</p>}
              {notes.map(({ n, by }) => (
                <div key={n.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  <div className="hint">{by ?? "Usuari eliminat"} · {n.createdAt.toLocaleString("ca-ES", { dateStyle: "short", timeStyle: "short" })}</div>
                  <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{n.body}</div>
                </div>
              ))}
            </div>
          </div>
          <aside className="col-side">
            <form action={saveLead} className="card">
              <h3>Seguiment</h3>
              <input type="hidden" name="id" value={id} />
              <label>Estat
                <select name="status" defaultValue={l.status}>{LEAD_STATUSES.map((x) => <option key={x} value={x}>{statusLabel[x]}</option>)}</select>
              </label>
              <label>Responsable
                <select name="ownerId" defaultValue={l.ownerId ?? ""}><option value="">Sense assignar</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}</select>
              </label>
              <button className="btn primary" type="submit">Desa</button>
            </form>
            <div className="card">
              <h3>Client</h3>
              {client ? <Link className="btn" href={`/admin/clients/${client.id}`} style={{ textAlign: "center" }}>Veure el client</Link> : (
                <form action={convertLead}>
                  <input type="hidden" name="id" value={id} />
                  <p className="hint">Crea un client amb les dades d&apos;aquest contacte i marca el lead com a guanyat.</p>
                  <button className="btn" type="submit">Converteix en client</button>
                </form>
              )}
            </div>
            {others.length > 1 && (
              <div className="card">
                <h3>Altres peticions d&apos;aquest contacte</h3>
                {others.filter((o) => o.id !== id).map((o) => <Link key={o.id} href={`/admin/leads/${o.id}`} className="row"><span>{o.at.toLocaleDateString("ca-ES")}</span><span className="chip">{statusLabel[o.status as keyof typeof statusLabel] ?? o.status}</span></Link>)}
              </div>
            )}
            {can(me, "data:erase") && (
              <form action={eraseContactAction} className="card">
                <input type="hidden" name="id" value={c.id} />
                <ConfirmButton className="btn link" message={`Eliminar ${c.email} i totes les seves dades (leads, notes, respostes, arxius, butlletí, client associat)? No es pot desfer.`}>Elimina les dades</ConfirmButton>
              </form>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
