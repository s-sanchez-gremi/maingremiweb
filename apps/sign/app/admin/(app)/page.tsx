import Link from "next/link";
import { requireUser } from "@apex/core/auth";
import { STATUS_LABEL } from "@apex/sign/state";
import { dayInMadrid } from "@apex/sign/time";
import { listRequests } from "@/lib/requests";
import { createRequest } from "./actions";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string }> }) {
  await requireUser("sign:write");
  const sp = await searchParams;
  const rows = await listRequests();
  return (
    <>
      <div className="top"><h1>Tauler</h1></div>
      <div className="body" style={{ display: "grid", gap: 12, alignContent: "start" }}>
        {sp.deleted && <p role="status" className="msg ok">Esborrany eliminat.</p>}
        {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
        <form action={createRequest} className="card" style={{ display: "grid", gap: 8, maxWidth: 560 }}>
          <h3>Nova sol·licitud de signatura</h3>
          <label>Títol (opcional)<input name="title" maxLength={200} /></label>
          <label>Document PDF (màx. 15 MB, 100 pàgines)<input name="file" type="file" accept=".pdf,application/pdf" required /></label>
          <div className="row"><button className="btn primary" type="submit">Puja i crea l&apos;esborrany</button></div>
        </form>
        <div className="card">
          <h3>Sol·licituds ({rows.length})</h3>
          {rows.length === 0 && <p className="hint">Encara no n&apos;hi ha cap.</p>}
          {rows.map((r) => (
            <Link key={r.id} href={`/admin/requests/${r.id}`} className="row">
              <span><strong>{r.title}</strong><br /><span className="hint">{r.signed} de {r.signers} signats{r.expiresAt ? ` · caduca el ${dayInMadrid(r.expiresAt)}` : ""}</span></span>
              <span className="chip">{STATUS_LABEL[r.status]}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
