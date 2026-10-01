import { ConfirmButton } from "@apex/ui/components/ConfirmButton";
import { markPaidAction, saveEntryAction, voidEntryAction } from "@/app/admin/(app)/erp/actions";
import type { Options } from "@/lib/erp-entities";
import { VAT_RATES, plainEuros } from "@apex/core/money";

export type EntryValues = {
  id?: string; kind: "expense" | "income"; occurredOn: string; description: string; supplierId: string; memberId: string; counterparty: string; categoryId: string; costCenterId: string;
  baseCents: number | null; vatBp: number; docNumber: string; dueOn: string; paidOn: string; paymentMethod: string; feePeriod: string; notes: string; fileName: string | null;
};

const METHODS = ["", "Transferència", "Domiciliació", "Targeta", "Efectiu", "Altres"];

/** One form for expenses and income (new and edit). Amounts are typed as base + VAT rate; the total is computed. */
export function EntryForm({ v, opts, members }: { v: EntryValues; opts: Options; members: { value: string; label: string }[] }) {
  const exp = v.kind === "expense";
  const sel = (name: string, label: string, list: { value: string; label: string }[], cur: string) => (
    <label>{label}<select name={name} defaultValue={cur}><option value="">—</option>{list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
  );
  return (
    <>
      <form action={saveEntryAction} className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <input type="hidden" name="kind" value={v.kind} />{v.id && <input type="hidden" name="id" value={v.id} />}
        <label>Data<input name="occurredOn" type="date" required defaultValue={v.occurredOn} /></label>
        <label style={{ gridColumn: "span 2" }}>Descripció<input name="description" required maxLength={300} defaultValue={v.description} /></label>
        {exp ? sel("supplierId", "Proveïdor", opts.suppliers, v.supplierId) : sel("memberId", "Soci", members, v.memberId)}
        <label>{exp ? "Tercer (si no és a la llista)" : "Pagador (si no és soci)"}<input name="counterparty" maxLength={200} defaultValue={v.counterparty} /></label>
        {sel("categoryId", "Categoria", exp ? opts["categories-expense"] : (opts.categories ?? []), v.categoryId)}
        {sel("costCenterId", "Centre de cost (curs, projecte…)", opts["cost-centers"], v.costCenterId)}
        <label>Base (sense IVA, €)<input name="base" inputMode="decimal" required defaultValue={v.baseCents === null ? "" : plainEuros(v.baseCents)} /></label>
        <label>IVA<select name="vatBp" defaultValue={String(v.vatBp)}>{VAT_RATES.map((r) => <option key={r} value={r}>{r / 100} %</option>)}</select></label>
        <label>{exp ? "Nº de factura del proveïdor" : "Nº de factura (Sage)"}<input name="docNumber" maxLength={80} defaultValue={v.docNumber} /></label>
        <label>Venciment<input name="dueOn" type="date" defaultValue={v.dueOn} /></label>
        <label>Pagat el<input name="paidOn" type="date" defaultValue={v.paidOn} /></label>
        <label>Mètode<select name="paymentMethod" defaultValue={v.paymentMethod}>{METHODS.map((m) => <option key={m} value={m}>{m || "—"}</option>)}</select></label>
        {!exp && <label>Període de la quota<input name="feePeriod" placeholder="2026 o 2026-T1" maxLength={20} defaultValue={v.feePeriod} /></label>}
        <label>Document (PDF, imatge, Word, Excel; màx. 10 MB){v.fileName && <span className="hint"> · actual: {v.fileName}</span>}<input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.docx,.xlsx" /></label>
        <label style={{ gridColumn: "1 / -1" }}>Notes<textarea name="notes" defaultValue={v.notes} /></label>
        <div className="row" style={{ gridColumn: "1 / -1", justifyContent: "flex-start" }}>
          <button className="btn primary" type="submit">Desa</button>
          {v.id && v.fileName && <a className="btn" href={`/admin/erp/entries/${v.id}/file`}>Descarrega el document</a>}
        </div>
      </form>
      {v.id && (
        <div className="row" style={{ justifyContent: "flex-start", gap: 12 }}>
          {!v.paidOn && (
            <form action={markPaidAction} className="row" style={{ gap: 8 }}>
              <input type="hidden" name="id" value={v.id} />
              <label>Pagat el<input name="paidOn" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
              <label>Mètode<select name="method">{METHODS.map((m) => <option key={m} value={m}>{m || "—"}</option>)}</select></label>
              <button className="btn" type="submit">Marca com a pagat</button>
            </form>
          )}
          <form action={voidEntryAction}><input type="hidden" name="id" value={v.id} /><ConfirmButton className="btn link" message="Anul·lar aquest registre? Deixarà de comptar als llistats i totals (queda guardat per traçabilitat).">Anul·la</ConfirmButton></form>
        </div>
      )}
    </>
  );
}
