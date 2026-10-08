import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@apex/core/auth";
import { ConfirmButton } from "@apex/ui/components/ConfirmButton";
import { KIND_LABEL, num, type FieldKind } from "@apex/sign/geometry";
import { isEditable, STATUS_LABEL } from "@apex/sign/state";
import { dayInMadrid } from "@apex/sign/time";
import { PROBLEM_TEXT } from "@apex/sign/validate";
import { FieldPlacer } from "@/components/FieldPlacer";
import { checkRequest, getRequest, listEvents } from "@/lib/requests";
import { cancelRequest, createField, createSigner, deleteField, deleteSigner, removeRequest, saveSettings, shiftSigner, submitRequest } from "../../actions";

const SAVED: Record<string, string> = { created: "Esborrany creat.", settings: "Desat.", signer: "Signants actualitzats.", field: "Camps actualitzats.", sent: "Enviada: els signants ja han rebut el correu.", voided: "Sol·licitud anul·lada: els enllaços ja no funcionen." };
const SIGNER_STATUS: Record<string, string> = { pending: "Pendent", opened: "L'ha oberta", signed: "Ha signat", declined: "Ha rebutjat" };
const EVENT_LABEL: Record<string, string> = {
  created: "Esborrany creat", sent: "Enviada", opened: "Ha obert l'enllaç", consented: "Ha acceptat signar electrònicament", signed: "Ha signat", declined: "Ha rebutjat signar",
  reminded: "Recordatori enviat", voided: "Anul·lada", expired: "Caducada", sealed: "Document segellat", downloaded: "Descarregat",
};
const when = (d: Date | null) => (d ? d.toLocaleString("ca-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" }) : "");

export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; page?: string }> }) {
  await requireUser("sign:write");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await getRequest(id);
  if (!r) notFound();
  const { request, document, signers, fields } = r;
  const editable = isEditable(request.status);
  const problems = editable ? await checkRequest(id) : [];
  const events = editable ? [] : await listEvents(id);
  const signerNo = new Map(signers.map((s, i) => [s.id, i + 1]));
  const signerName = new Map(signers.map((s) => [s.id, s.name]));
  const size = document.size < 1024 * 1024 ? `${Math.max(1, Math.round(document.size / 1024))} KB` : `${(document.size / 1024 / 1024).toFixed(1)} MB`;

  return (
    <>
      <div className="top"><div><div className="crumb"><Link href="/admin">Tauler</Link></div><h1>{document.title}</h1></div><span className="chip">{STATUS_LABEL[request.status]}</span></div>
      <div className="body">
        {sp.saved && <p role="status" className="msg ok">{SAVED[sp.saved] ?? "Desat."}</p>}
        {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
        {!editable && <p className="msg">Aquesta sol·licitud ja no es pot modificar.</p>}
        <div className="cols">
          <div className="col-main">
            <form action={saveSettings} className="card" style={{ display: "grid", gap: 8 }}>
              <h3>Document i ajustos</h3>
              <input type="hidden" name="id" value={id} />
              <p className="hint">{document.fileName} · {document.pageCount} {document.pageCount === 1 ? "pàgina" : "pàgines"} · {size} · SHA-256 {document.sha256.slice(0, 16)}…</p>
              <label>Títol<input name="title" defaultValue={document.title} maxLength={200} required disabled={!editable} /></label>
              <label>Idioma dels correus i de la pàgina de signatura
                <select name="locale" defaultValue={request.locale} disabled={!editable}><option value="ca">Català</option><option value="es">Castellà</option><option value="en">Anglès</option></select>
              </label>
              <label>Caduca el (fins a final del dia)<input name="expiresOn" type="date" defaultValue={request.expiresAt ? dayInMadrid(request.expiresAt) : ""} required disabled={!editable} /></label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="ordered" value="1" defaultChecked={request.ordered} disabled={!editable} style={{ width: "auto" }} /> Signen un darrere l&apos;altre, en l&apos;ordre de la llista</label>
              <label>Missatge als signants (opcional)<textarea name="message" defaultValue={request.message} maxLength={2000} disabled={!editable} /></label>
              {editable && <div className="row"><button className="btn primary" type="submit">Desa</button></div>}
            </form>

            <div className="card" id="signers">
              <h3>Signants ({signers.length})</h3>
              {signers.length === 0 && <p className="hint">Encara no hi ha cap signant.</p>}
              {signers.map((s, i) => (
                <div key={s.id} className="row">
                  <span><strong>{i + 1}. {s.name}</strong><br /><span className="hint">{s.email}</span></span>
                  {editable && (
                    <span style={{ display: "flex", gap: 4 }}>
                      <form action={shiftSigner}><input type="hidden" name="id" value={id} /><input type="hidden" name="signerId" value={s.id} /><input type="hidden" name="dir" value="up" /><button className="btn" type="submit" disabled={i === 0} aria-label={`Puja ${s.name}`}>↑</button></form>
                      <form action={shiftSigner}><input type="hidden" name="id" value={id} /><input type="hidden" name="signerId" value={s.id} /><input type="hidden" name="dir" value="down" /><button className="btn" type="submit" disabled={i === signers.length - 1} aria-label={`Baixa ${s.name}`}>↓</button></form>
                      <form action={deleteSigner}><input type="hidden" name="id" value={id} /><input type="hidden" name="signerId" value={s.id} /><ConfirmButton className="btn danger" message={`Treure ${s.name} i els seus camps?`} aria-label={`Treu ${s.name}`}>✕</ConfirmButton></form>
                    </span>
                  )}
                </div>
              ))}
              {editable && (
                <form action={createSigner} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
                  <input type="hidden" name="id" value={id} />
                  <label style={{ flex: "1 1 180px" }}>Nom<input name="name" required maxLength={200} autoComplete="off" /></label>
                  <label style={{ flex: "1 1 220px" }}>Correu electrònic<input name="email" type="email" required maxLength={254} autoComplete="off" /></label>
                  <button className="btn primary" type="submit">Afegeix</button>
                </form>
              )}
            </div>

            <div className="card" id="fields">
              <h3>Camps ({fields.length})</h3>
              {editable && (
                <FieldPlacer
                  requestId={id} action={createField} initialPage={Number(sp.page) || 1} pages={document.pages}
                  signers={signers.map((s) => ({ id: s.id, name: s.name }))}
                  fields={fields.map((f) => ({ id: f.id, signerNo: signerNo.get(f.signerId) ?? 0, kind: f.kind as FieldKind, page: f.page, x: num(f.x), y: num(f.y), w: num(f.w), h: num(f.h), required: f.required }))}
                />
              )}
              {fields.length === 0 && <p className="hint">Encara no hi ha cap camp.</p>}
              {fields.map((f) => (
                <div key={f.id} className="row">
                  <span>{KIND_LABEL[f.kind as FieldKind]}{f.required ? "" : " (opcional)"} · {signerNo.get(f.signerId)}. {signerName.get(f.signerId)}<br /><span className="hint">pàgina {f.page} · {num(f.x)}%, {num(f.y)}% · {num(f.w)}×{num(f.h)}%</span></span>
                  {editable && <form action={deleteField}><input type="hidden" name="id" value={id} /><input type="hidden" name="fieldId" value={f.id} /><ConfirmButton className="btn danger" message="Treure aquest camp?" aria-label="Treu el camp">✕</ConfirmButton></form>}
                </div>
              ))}
            </div>
          </div>

          <div className="col-side">
            {!editable && (
              <>
                <div className="card">
                  <h3>Seguiment</h3>
                  <p className="hint">Caduca el {request.expiresAt ? dayInMadrid(request.expiresAt) : "—"}{request.ordered ? " · signen en ordre" : ""}</p>
                  {signers.map((s, i) => (
                    <div key={s.id} className="row"><span><strong>{i + 1}. {s.name}</strong><br /><span className="hint">{s.email}{s.signedAt ? ` · ${when(s.signedAt)}` : ""}</span></span><span className="chip">{SIGNER_STATUS[s.status]}</span></div>
                  ))}
                </div>
                {request.status === "sent" && (
                  <form action={cancelRequest} className="card">
                    <input type="hidden" name="id" value={id} />
                    <ConfirmButton className="btn danger" message="Anul·lar la sol·licitud? Els enllaços dels signants deixaran de funcionar.">Anul·la la sol·licitud</ConfirmButton>
                  </form>
                )}
                <div className="card">
                  <h3>Registre</h3>
                  {events.map((e) => <p key={e.id} className="hint" style={{ margin: 0 }}>{when(e.at)} · {EVENT_LABEL[e.kind] ?? e.kind}{e.signer ? ` · ${e.signer}` : ""}</p>)}
                </div>
              </>
            )}
            {editable && (
              <>
                <div className="card" id="check">
                  <h3>Comprovació</h3>
                  {problems.length === 0
                    ? <p className="msg ok" role="status">Tot a punt per enviar.</p>
                    : <ul role="status" style={{ margin: 0, paddingLeft: 18 }}>{problems.map((p, i) => (
                        <li key={i}>{PROBLEM_TEXT[p.code]}{p.signerId && signerName.get(p.signerId) ? ` (${signerName.get(p.signerId)})` : ""}</li>
                      ))}</ul>}
                </div>
                {problems.length === 0 && (
                  <form action={submitRequest} className="card">
                    <input type="hidden" name="id" value={id} />
                    <ConfirmButton className="btn primary" message={request.ordered ? "Enviar la sol·licitud? El primer signant rebrà el correu ara i la resta quan li toqui. Després ja no es podrà modificar." : "Enviar la sol·licitud a tots els signants? Després ja no es podrà modificar."}>Envia als signants</ConfirmButton>
                  </form>
                )}
                <form action={removeRequest} className="card">
                  <input type="hidden" name="id" value={id} />
                  <ConfirmButton className="btn danger" message="Eliminar aquest esborrany, el document i tot el que s'hi ha preparat?">Elimina l&apos;esborrany</ConfirmButton>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
