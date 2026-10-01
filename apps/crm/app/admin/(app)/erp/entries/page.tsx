import Link from "next/link";
import { ListSearch } from "@apex/ui/components/ListSearch";
import { PAGE_SIZE, listEntries } from "@/lib/erp";
import { loadOptions } from "@/lib/erp-options";
import { formatEuros } from "@apex/core/money";

type SP = { kind?: string; q?: string; from?: string; to?: string; costCenter?: string; category?: string; status?: string; page?: string; saved?: string };

export default async function Entries({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const kind = sp.kind === "income" ? "income" : "expense";
  const page = Math.max(1, Number(sp.page) || 1);
  const f = { ...sp, kind, page };
  const [{ rows, total, sums }, opts] = await Promise.all([listEntries(f), loadOptions()]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const keep = Object.fromEntries(Object.entries({ kind, q: sp.q, from: sp.from, to: sp.to, costCenter: sp.costCenter, category: sp.category, status: sp.status }).filter(([, v]) => v)) as Record<string, string>;
  const href = (p: number) => `/admin/erp/entries?${new URLSearchParams({ ...keep, page: String(p) })}`;
  const label = kind === "income" ? "Ingressos" : "Despeses";
  return (
    <>
      <div className="top"><div><div className="crumb">Gestió</div><h1>{label}</h1></div>
        <div className="row"><Link className="btn primary" href={`/admin/erp/entries/new?kind=${kind}`}>{kind === "income" ? "Nou ingrés" : "Nova despesa"}</Link>
          <a className="btn" href={`/admin/erp/export?${new URLSearchParams(keep)}`}>Exporta (CSV per a Sage)</a></div></div>
      <div className="body" style={{ display: "grid", gap: 14 }}>
        {sp.saved && <p role="status" className="msg ok">{sp.saved === "void" ? "Registre anul·lat." : sp.saved === "renewal" ? "Renovació registrada. Revisa l'IVA i el número de factura." : "Desat."}</p>}
        <ListSearch label={`Cerca ${label.toLowerCase()}`} placeholder="Descripció, tercer o número de factura" q={sp.q} hidden={{ kind }}>
          <input type="date" name="from" aria-label="Des de" defaultValue={sp.from ?? ""} /><input type="date" name="to" aria-label="Fins a" defaultValue={sp.to ?? ""} />
          <select name="costCenter" aria-label="Centre de cost" defaultValue={sp.costCenter ?? ""}><option value="">Tots els centres</option>{opts["cost-centers"].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <select name="category" aria-label="Categoria" defaultValue={sp.category ?? ""}><option value="">Totes les categories</option>{opts.categories.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <select name="status" aria-label="Estat" defaultValue={sp.status ?? ""}><option value="">Tots</option><option value="unpaid">Pendents</option><option value="overdue">Vençuts</option><option value="paid">Pagats</option></select>
        </ListSearch>
        <p className="hint"><strong>{total}</strong> registres · base {formatEuros(sums.base)} · IVA {formatEuros(sums.vat)} · total <strong>{formatEuros(sums.total)}</strong></p>
        {rows.length === 0 ? <p className="hint">No hi ha cap registre amb aquests filtres.</p> : (
          <table>
            <thead><tr><th>Data</th><th>Descripció</th><th>Tercer</th><th>Categoria</th><th>Centre</th><th>Total</th><th>Estat</th></tr></thead>
            <tbody>{rows.map(({ e, category, costCenter }) => (
              <tr key={e.id}>
                <td>{e.occurredOn}</td><td><Link href={`/admin/erp/entries/${e.id}`}><strong>{e.description}</strong></Link>{e.docNumber && <div className="hint">{e.docNumber}</div>}</td>
                <td>{e.counterparty || "—"}</td><td className="hint">{category ?? "—"}</td><td className="hint">{costCenter ?? "—"}</td><td>{formatEuros(e.totalCents)}</td>
                <td>{e.paidOn ? <span className="chip ok">Pagat</span> : <span className="chip sched">{e.dueOn && e.dueOn < new Date().toISOString().slice(0, 10) ? "Vençut" : "Pendent"}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {pages > 1 && (
          <nav className="row" aria-label="Pàgines">
            {page > 1 ? <Link className="btn" href={href(page - 1)}>← Anterior</Link> : <span />}<span className="hint">Pàgina {page} de {pages}</span>{page < pages ? <Link className="btn" href={href(page + 1)}>Següent →</Link> : <span />}
          </nav>
        )}
      </div>
    </>
  );
}
