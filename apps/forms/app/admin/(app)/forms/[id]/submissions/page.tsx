import Link from "next/link";
import { EmptyState } from "@apex/ui/components/Identity";
import { notFound } from "next/navigation";
import { desc, eq, count } from "drizzle-orm";
import { db } from "@apex/db";
import { requireUser } from "@apex/core/auth";
import { contacts, forms, submissions } from "@apex/db/schema";
import { ConfirmButton } from "@apex/ui/components/ConfirmButton";
import { answerText } from "@apex/forms/answer-text";
import { removeSubmission, retryRouting } from "../../actions";

const PAGE = 25;

export default async function Submissions({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ p?: string; deleted?: string; retried?: string }> }) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [f] = await db.select().from(forms).where(eq(forms.id, id));
  if (!f) notFound();
  const page = Math.max(1, Number(sp.p) || 1);
  const [{ n }] = await db.select({ n: count() }).from(submissions).where(eq(submissions.formId, id));
  const rows = await db.select({ s: submissions, email: contacts.email }).from(submissions).leftJoin(contacts, eq(contacts.id, submissions.contactId))
    .where(eq(submissions.formId, id)).orderBy(desc(submissions.createdAt)).limit(PAGE).offset((page - 1) * PAGE);
  const pages = Math.max(1, Math.ceil(n / PAGE));

  return (
    <>
      <div className="top">
        <div><div className="crumb"><Link href="/admin/forms">Formularis</Link> / <Link href={`/admin/forms/${id}`}>{f.name}</Link></div><h1>Respostes ({n})</h1></div>
        <a className="btn" href={`/admin/forms/${id}/export`}>Exporta (CSV)</a>
      </div>
      <div className="body" style={{ display: "grid", gap: 14, maxWidth: 900 }}>
        {sp.deleted && <p role="status" className="msg ok">Resposta eliminada.</p>}
        {sp.retried && <p role="status" className="msg ok">Es tornarà a provar al CRM d&apos;aquí a un moment.</p>}
        {rows.length === 0 && <EmptyState eyebrow="Respostes" title="Encara no hi ha respostes">Quan algú enviï el formulari, la resposta apareixerà aquí.</EmptyState>}
        {rows.map(({ s, email }) => (
          <article className="card" key={s.id}>
            <div className="row">
              <strong>{s.createdAt.toLocaleString("ca-ES", { dateStyle: "medium", timeStyle: "short" })}</strong>
              <span className="chip">{s.locale.toUpperCase()}</span>
            </div>
            <dl style={{ margin: 0, display: "grid", gap: 6 }}>
              {s.answers.map((a) => {
                const v = a.value as unknown;
                return (
                  <div key={a.id} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 10 }}>
                    <dt className="hint" style={{ margin: 0 }}>{a.label}</dt>
                    <dd style={{ margin: 0, overflowWrap: "anywhere" }}>
                      {a.type === "file" && v && typeof v === "object"
                        ? <a style={{ color: "var(--ink)", textDecoration: "underline" }} href={`/admin/forms/${id}/file?sub=${s.id}&field=${a.id}`}>{(v as { name: string }).name}</a>
                        : answerText(a)}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <div className="hint">
              {[email && `Contacte: ${email}`, s.sourcePath && `Origen: ${s.sourcePath}`, s.theme && `Tema: ${s.theme}`, Object.keys(s.utm).length ? `Campanya: ${Object.entries(s.utm).map(([k, v]) => `${k}=${v}`).join(", ")}` : ""].filter(Boolean).join(" · ")}
            </div>
            {s.routingStatus && (
              <div className="hint" style={{ display: "grid", gap: 6 }}>
                {s.routingStatus === "pending" && <span><span className="chip">Pendent</span> El CRM encara no n&apos;ha creat els registres{s.routingError ? ` (ho ha provat ${s.routingAttempts} cops: ${s.routingError})` : ""}.</span>}
                {s.routingStatus === "done" && (
                  <span><span className="chip ok">Passat al CRM</span> {(s.routedRecords ?? []).map((r) => `${r.entity === "people" ? "Persona" : r.entity === "attendance" ? "Inscripció" : r.entity === "labour" ? "Cas laboral" : r.entity === "training" ? "Formació" : r.entity === "job-seekers" ? "Borsa de treball" : r.entity}: ${r.label} (${r.action === "created" ? "creat" : r.action === "updated" ? "completat" : "ja hi era"})`).join(" · ")}</span>
                )}
                {s.routingStatus === "failed" && (
                  <>
                    <span role="alert"><span className="chip">No s&apos;ha pogut passar al CRM</span> {s.routingError}</span>
                    <form action={retryRouting}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="formId" value={id} /><button className="btn" type="submit">Torna-ho a provar</button></form>
                  </>
                )}
              </div>
            )}
            {s.editCount > 0 && (
              <div className="hint" style={{ display: "grid", gap: 6 }}>
                <span><span className="chip">Modificada {s.editCount} {s.editCount === 1 ? "cop" : "cops"}</span> per la persona; l&apos;última, el {s.editedAt?.toLocaleString("ca-ES")}</span>
                {s.originalAnswers && (
                  <details>
                    <summary>Veure la resposta original</summary>
                    <dl style={{ margin: "6px 0 0", display: "grid", gap: 4 }}>
                      {s.originalAnswers.map((a) => (
                        <div key={a.id} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 10 }}>
                          <dt style={{ margin: 0 }}>{a.label}</dt><dd style={{ margin: 0, overflowWrap: "anywhere" }}>{answerText(a)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </div>
            )}
            {s.consentText && <div className="hint">Consentiment acceptat el {s.consentAt?.toLocaleString("ca-ES")}: «{s.consentText}»</div>}
            <form action={removeSubmission}>
              <input type="hidden" name="id" value={s.id} /><input type="hidden" name="formId" value={id} />
              <ConfirmButton className="btn link" message="Eliminar aquesta resposta i els seus arxius?">Elimina</ConfirmButton>
            </form>
          </article>
        ))}
        {pages > 1 && (
          <nav className="row" aria-label="Pàgines" style={{ justifyContent: "flex-start", gap: 12 }}>
            {page > 1 && <Link className="btn" href={`?p=${page - 1}`}>← Anteriors</Link>}
            <span className="hint">Pàgina {page} de {pages}</span>
            {page < pages && <Link className="btn" href={`?p=${page + 1}`}>Següents →</Link>}
          </nav>
        )}
      </div>
    </>
  );
}
