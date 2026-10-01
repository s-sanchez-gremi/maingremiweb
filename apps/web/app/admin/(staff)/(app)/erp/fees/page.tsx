import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { ErpError, feePreview } from "@/lib/erp";
import { formatEuros } from "@/lib/money";
import { generateFeesAction } from "../actions";

export default async function Fees({ searchParams }: { searchParams: Promise<{ period?: string; created?: string; error?: string }> }) {
  const sp = await searchParams;
  const period = sp.period ?? String(new Date().getFullYear());
  let preview: Awaited<ReturnType<typeof feePreview>> | null = null, err = sp.error;
  try { preview = await feePreview(period); } catch (e) { if (e instanceof ErpError) err = e.message; else throw e; }
  const total = preview?.items.reduce((a, i) => a + i.base + i.vat, 0) ?? 0;
  return (
    <>
      <div className="top"><div><div className="crumb">Gestió</div><h1>Generar quotes de socis</h1></div></div>
      <div className="body" style={{ display: "grid", gap: 14 }}>
        {sp.created && <p role="status" className="msg ok">{sp.created} quotes creades. Les trobaràs a Ingressos (pendents de cobrament).</p>}
        {err && <p role="alert" className="msg err">{err}</p>}
        <p className="hint">Crea un ingrés pendent per cada soci actiu amb tram, segons la seva facturació (anual: «2026»; trimestral: «2026-T1»). Els socis que ja tenen la quota d&apos;aquest període s&apos;ometen. Les factures les emet Sage: després pots posar-hi el número.</p>
        <form method="get" className="row" style={{ justifyContent: "flex-start" }}><label>Període<input name="period" defaultValue={period} placeholder="2026 o 2026-T1" /></label><button className="btn" type="submit">Previsualitza</button></form>
        {preview && (
          <div className="card">
            <h3>{preview.items.length} quotes per generar · {formatEuros(total)} amb IVA</h3>
            {preview.items.length === 0 && <p className="hint">No hi ha cap soci pendent per a aquest període.</p>}
            {preview.items.length > 0 && (
              <>
                <table><thead><tr><th>Soci</th><th>Tram</th><th>Base</th><th>IVA</th></tr></thead>
                  <tbody>{preview.items.map((i) => <tr key={i.member.id}><td>{i.member.name}</td><td>{i.tier.name}</td><td>{formatEuros(i.base)}</td><td>{formatEuros(i.vat)}</td></tr>)}</tbody></table>
                <form action={generateFeesAction}><input type="hidden" name="period" value={period} /><ConfirmButton className="btn primary" message={`Crear ${preview.items.length} quotes del període ${period}?`}>Genera les quotes</ConfirmButton></form>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
