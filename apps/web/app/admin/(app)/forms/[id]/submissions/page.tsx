import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, count } from "drizzle-orm";
import { db } from "@apex/db";
import { requireUser } from "@apex/core/auth";
import { contacts, forms, submissions } from "@apex/db/schema";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { removeSubmission } from "../../actions";

const PAGE = 25;

export default async function Submissions({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ p?: string; deleted?: string }> }) {
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
        {rows.length === 0 && <p className="hint">Encara no hi ha respostes.</p>}
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
                        ? <a style={{ color: "var(--accent)", textDecoration: "underline" }} href={`/admin/forms/${id}/file?sub=${s.id}&field=${a.id}`}>{(v as { name: string }).name}</a>
                        : Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Sí" : "No") : String(v ?? "")}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <div className="hint">
              {[email && `Contacte: ${email}`, s.sourcePath && `Origen: ${s.sourcePath}`, s.theme && `Tema: ${s.theme}`, Object.keys(s.utm).length ? `Campanya: ${Object.entries(s.utm).map(([k, v]) => `${k}=${v}`).join(", ")}` : ""].filter(Boolean).join(" · ")}
            </div>
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
