import { signatureStatus, type SignatureRow } from "@/lib/signatures";

/** Where each linked document stands. Read-only: the Signatures app sends and follows requests. */
export function SignaturesCard({ rows }: { rows: SignatureRow[] }) {
  const base = process.env.SIGN_URL?.replace(/\/+$/, "");
  return (
    <div className="card">
      <h3>Signatures ({rows.length})</h3>
      {rows.length === 0 && <p className="hint">Cap document enviat a signar.</p>}
      {rows.map((r) => (
        <div key={r.id} className="row">
          <span><strong>{base ? <a href={`${base}/admin/requests/${r.id}`}>{r.title}</a> : r.title}</strong><br />
            <span className="hint">{r.signed} de {r.total} han signat{r.completedAt ? ` · acabada el ${r.completedAt.toLocaleDateString("ca-ES", { timeZone: "Europe/Madrid" })}` : ""}</span></span>
          <span className="chip">{signatureStatus(r.status)}</span>
        </div>
      ))}
    </div>
  );
}
