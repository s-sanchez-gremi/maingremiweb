import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { requireUser } from "@apex/core/auth";
import { forms } from "@apex/db/schema";
import { ConfirmButton } from "@apex/ui/components/ConfirmButton";
import { listWebhooks, recentDeliveries } from "@apex/forms/webhooks";
import { addWebhook, deleteWebhook, retryWebhookDelivery, rotateWebhookSecret, testWebhook, toggleWebhook } from "./actions";

const SAVED: Record<string, string> = {
  added: "Endpoint afegit.", toggled: "Desat.", deleted: "Endpoint eliminat.", rotated: "Secret canviat: actualitza'l al receptor.",
  tested: "Prova enviada: mira el resultat als enviaments.", retried: "Reintent fet.",
};
const when = (d: Date | null) => (d ? d.toLocaleString("ca-ES", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Madrid" }) : "—");
const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };

const SNIPPET = `const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
const ok = crypto.timingSafeEqual(
  Buffer.from(v1, "hex"),
  crypto.createHmac("sha256", secret).update(t + "." + rawBody).digest(),
) && Math.abs(Date.now() / 1000 - Number(t)) < 300;`;

export default async function Integrations({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [f] = await db.select().from(forms).where(eq(forms.id, id));
  if (!f) notFound();
  const [hooks, deliveries] = await Promise.all([listWebhooks(id), recentDeliveries(id)]);

  return (
    <>
      <div className="top">
        <div><div className="crumb"><Link href="/admin/forms">Formularis</Link> / <Link href={`/admin/forms/${id}`}>{f.name}</Link></div><h1>Integracions</h1></div>
      </div>
      <div className="body" style={{ display: "grid", gap: 16, maxWidth: 960 }}>
        {sp.saved && SAVED[sp.saved] && <p role="status" className="msg ok">{SAVED[sp.saved]}</p>}
        {sp.error && <p role="alert" className="msg err">{sp.error}</p>}

        <div className="card">
          <h3>Webhooks</h3>
          <p className="hint" style={{ margin: 0 }}>
            Cada vegada que arriba o es modifica una resposta, aquest formulari avisa els endpoints d&apos;aquí (per exemple Zapier, Make o un sistema propi) amb un missatge JSON signat.
            Si l&apos;endpoint falla, es reintenta durant uns dies. Les dades de la resposta viatgen a aquests sistemes: afegeix només sistemes de confiança i esmenta-ho al text de privacitat.
          </p>
          <form action={addWebhook} style={{ display: "grid", gap: 8 }}>
            <input type="hidden" name="formId" value={id} />
            <label>Adreça de l&apos;endpoint<input name="url" type="text" inputMode="url" placeholder="https://exemple.cat/webhook" required maxLength={500} /></label>
            <div><button className="btn primary" type="submit">Afegeix l&apos;endpoint</button></div>
          </form>

          {hooks.length === 0 && <p className="hint">Encara no hi ha cap endpoint.</p>}
          {hooks.map((h) => (
            <div key={h.id} className="card" style={{ display: "grid", gap: 8 }}>
              <div className="row">
                <strong style={{ overflowWrap: "anywhere" }}>{h.url}</strong>
                <span className={h.enabled ? "chip ok" : "chip"}>{h.enabled ? "Actiu" : "Desactivat"}</span>
              </div>
              <details>
                <summary>Veure el secret per signar</summary>
                <code style={{ overflowWrap: "anywhere" }}>{h.secret}</code>
              </details>
              <div className="row" style={{ justifyContent: "flex-start", gap: 8, flexWrap: "wrap" }}>
                <form action={testWebhook}><input type="hidden" name="formId" value={id} /><input type="hidden" name="id" value={h.id} /><button className="btn" type="submit" aria-label={`Envia una prova a ${host(h.url)}`}>Envia una prova</button></form>
                <form action={toggleWebhook}><input type="hidden" name="formId" value={id} /><input type="hidden" name="id" value={h.id} /><button className="btn" type="submit" aria-label={`${h.enabled ? "Desactiva" : "Activa"} ${host(h.url)}`}>{h.enabled ? "Desactiva" : "Activa"}</button></form>
                <form action={rotateWebhookSecret}><input type="hidden" name="formId" value={id} /><input type="hidden" name="id" value={h.id} /><ConfirmButton className="btn" message="El secret actual deixarà de funcionar: hauràs d'actualitzar-lo al receptor. Continuar?">Canvia el secret</ConfirmButton></form>
                <form action={deleteWebhook}><input type="hidden" name="formId" value={id} /><input type="hidden" name="id" value={h.id} /><ConfirmButton className="btn link" message="Eliminar aquest endpoint i el seu historial d'enviaments?">Elimina</ConfirmButton></form>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Com comprovar que el missatge ve d&apos;aquí</h3>
          <p className="hint" style={{ margin: 0 }}>
            Cada petició és un POST amb el cos JSON i aquestes capçaleres: <code>X-Apex-Event</code> (<code>response.created</code>, <code>response.updated</code> o <code>ping</code>),
            {" "}<code>X-Apex-Delivery</code> (un identificador que no canvia en els reintents: serveix per ignorar duplicats) i <code>X-Apex-Signature: t=&lt;segons&gt;,v1=&lt;hex&gt;</code>.
            Calcula <code>HMAC-SHA256(secret, t + &quot;.&quot; + cos)</code> en hexadecimal, compara&apos;l amb <code>v1</code> i rebutja el missatge si <code>t</code> té més de 5 minuts.
            Respon amb un codi 2xx per donar-lo per rebut (les redireccions no se segueixen). Els fitxers no s&apos;envien, només el seu nom.
          </p>
          <pre style={{ margin: 0, overflowX: "auto", fontSize: 12 }}>{SNIPPET}</pre>
        </div>

        <div className="card">
          <h3>Últims enviaments</h3>
          {deliveries.length === 0 ? <p className="hint">Encara no se n&apos;ha fet cap.</p> : (
            <table>
              <thead><tr><th>Data</th><th>Endpoint</th><th>Esdeveniment</th><th>Estat</th><th>Detall</th><th><span className="sr-only">Accions</span></th></tr></thead>
              <tbody>
                {deliveries.map(({ d, url }) => (
                  <tr key={d.id}>
                    <td>{when(d.createdAt)}</td>
                    <td style={{ overflowWrap: "anywhere" }}>{host(url)}</td>
                    <td>{d.event}</td>
                    <td><span className={d.status === "sent" ? "chip ok" : "chip"}>{d.status === "sent" ? "Enviat" : d.status === "dead" ? "Fallit" : `Pendent (${d.attempts} intents)`}</span></td>
                    <td style={{ overflowWrap: "anywhere" }}>{d.status === "sent" ? `HTTP ${d.lastStatus}` : d.lastError ?? "—"}{d.status === "pending" && d.attempts > 0 ? ` · propera: ${when(d.runAfter)}` : ""}</td>
                    <td>{d.status !== "sent" && <form action={retryWebhookDelivery}><input type="hidden" name="formId" value={id} /><input type="hidden" name="id" value={d.id} /><button className="btn link" type="submit">Torna-ho a provar</button></form>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
