"use client";
import { useActionState } from "react";
import { importCsvAction } from "@/lib/records/import-actions";
import type { ImportResult } from "@/lib/records/csv-import";

export function ImportForm({ entity, back }: { entity: string; back: string }) {
  const [res, action, pending] = useActionState(importCsvAction, null as ImportResult | null);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <form action={action} className="card" style={{ display: "grid", gap: 10 }}>
        <input type="hidden" name="entity" value={entity} />
        <label>Fitxer CSV<input type="file" name="file" accept=".csv,text/csv,text/plain" required /></label>
        <label className="row" style={{ justifyContent: "flex-start", gap: 8 }}><input type="checkbox" name="validate" defaultChecked />Només validar (no desa res)</label>
        <label className="row" style={{ justifyContent: "flex-start", gap: 8 }}><input type="checkbox" name="skipInvalid" />Importa les files vàlides i omet les que tenen errors</label>
        <div><button className="btn primary" type="submit" disabled={pending}>{pending ? "Processant…" : "Continua"}</button></div>
      </form>
      {res && (
        <section className="card" aria-label="Resultat" aria-live="polite">
          {res.fatal ? <p className="msg err" role="alert">{res.fatal}</p> : (
            <>
              <h3>{res.dryRun ? "Validació (no s'ha desat res)" : res.created ? "Importació feta" : "No s'ha desat res"}</h3>
              <p>{res.total} files llegides · <strong>{res.dryRun ? res.valid : res.created}</strong> {res.dryRun ? "es poden importar" : "desades"} · <strong>{res.errors.length}</strong> amb errors</p>
              {res.columns.length > 0 && <p className="hint">Columnes reconegudes: {res.columns.join(", ")}.</p>}
              {res.ignored.length > 0 && <p className="hint">Columnes ignorades (no coincideixen amb cap camp): {res.ignored.join(", ")}.</p>}
              {res.errors.length > 0 && (
                <>
                  <p className="hint">{res.dryRun || !res.created ? "Cap fila es desa mentre n'hi hagi amb errors, tret que marquis «omet les files amb errors»." : "Aquestes files no s'han desat:"}</p>
                  <ul>{res.errors.slice(0, 50).map((x) => <li key={x.row}>Fila {x.row}: {x.message}</li>)}</ul>
                  {res.errors.length > 50 && <p className="hint">…i {res.errors.length - 50} més.</p>}
                </>
              )}
              {!res.dryRun && res.created > 0 && <p><a href={back}>Veure la llista →</a></p>}
              {res.dryRun && res.errors.length === 0 && res.valid > 0 && <p className="msg ok">Tot correcte. Desmarca «Només validar» i torna a pujar el fitxer per importar-lo.</p>}
            </>
          )}
        </section>
      )}
    </div>
  );
}
