import Link from "next/link";
import { summary } from "@/lib/erp";
import { formatEuros } from "@/lib/money";

export default async function ErpHome({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const year = Number((await searchParams).year) || new Date().getFullYear();
  const s = await summary(year);
  const table = (rows: { name: string | null; kind: string; base: number }[], title: string) => {
    const names = [...new Set(rows.map((r) => r.name ?? "(sense assignar)"))];
    const v = (n: string, k: string) => rows.find((r) => (r.name ?? "(sense assignar)") === n && r.kind === k)?.base ?? 0;
    return (
      <div className="card"><h3>{title}</h3>
        {names.length === 0 ? <p className="hint">Encara no hi ha dades.</p> : (
          <table><thead><tr><th>{title}</th><th>Ingressos</th><th>Despeses</th><th>Resultat</th></tr></thead>
            <tbody>{names.map((n) => <tr key={n}><td>{n}</td><td>{formatEuros(v(n, "income"))}</td><td>{formatEuros(v(n, "expense"))}</td><td><strong>{formatEuros(v(n, "income") - v(n, "expense"))}</strong></td></tr>)}</tbody></table>
        )}
      </div>
    );
  };
  return (
    <>
      <div className="top"><div><div className="crumb">Gestió</div><h1>Resum {year}</h1></div></div>
      <div className="body" style={{ display: "grid", gap: 14 }}>
        <p className="hint">Apex només <strong>registra</strong>: la comptabilitat, les factures i els impostos continuen a Sage. Els imports són sense IVA (base).</p>
        <div className="cols" style={{ alignItems: "stretch" }}>
          <div className="card"><h3>Ingressos</h3><strong style={{ fontSize: 24 }}>{formatEuros(s.income)}</strong></div>
          <div className="card"><h3>Despeses</h3><strong style={{ fontSize: 24 }}>{formatEuros(s.expense)}</strong></div>
          <div className="card"><h3>Resultat</h3><strong style={{ fontSize: 24 }}>{formatEuros(s.income - s.expense)}</strong></div>
        </div>
        <div className="card">
          <h3>Pendent de pagament</h3>
          {s.unpaid.length === 0 && <p className="hint">Res pendent.</p>}
          {s.unpaid.map((u) => (
            <div key={u.kind} className="row"><Link href={`/admin/erp/entries?kind=${u.kind}&status=unpaid`}>{u.kind === "income" ? "Per cobrar" : "Per pagar"}: {u.n} ({formatEuros(u.total)} amb IVA)</Link>{u.overdue > 0 && <span className="chip sched">{u.overdue} vençudes</span>}</div>
          ))}
        </div>
        <div className="card">
          <h3>Renovacions pròximes (30 dies)</h3>
          {s.renewals.length === 0 && <p className="hint">Cap renovació propera.</p>}
          {s.renewals.map((r) => <div key={r.id} className="row"><Link href="/admin/erp/subscriptions">{r.name}</Link><span className="hint">{r.nextRenewal} · {formatEuros(r.amountCents)}</span></div>)}
        </div>
        {table(s.byCenter, "Centre de cost")}
        {table(s.byCategory, "Categoria")}
        <form method="get" className="row" style={{ justifyContent: "flex-start" }}><label>Any<input name="year" type="number" defaultValue={year} min={2000} max={2100} /></label><button className="btn" type="submit">Mostra</button></form>
      </div>
    </>
  );
}
