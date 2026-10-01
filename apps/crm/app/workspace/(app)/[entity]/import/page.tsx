import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { ImportForm } from "@/components/workspace/ImportForm";
import { screenEntity } from "@/lib/records/registry";
import { MAX_ROWS } from "@/lib/records/csv-import";

export default async function ImportPage({ params }: { params: Promise<{ entity: string }> }) {
  const user = await requireUser();
  const e = screenEntity((await params).entity);
  if (!e || !can(user, e.perm)) notFound();
  const here = `/workspace/${e.key}`;
  return (
    <div className="ws-content" style={{ maxWidth: 860 }}>
      <header className="ws-head"><h1>Importa {e.title.toLowerCase()}</h1></header>
      <p className="ws-hint"><Link href={here}>← Tornar a {e.title}</Link></p>
      <p>Puja un fitxer CSV (Excel o Google Sheets: «Desa com a CSV»). La primera fila són els noms de les columnes; fins a {MAX_ROWS} files. Es valida tot abans de desar res, i si hi ha un error no es desa cap fila (tret que triïs ometre-les).</p>
      <p><a className="ws-btn" href={`${here}/import/template`}>Descarrega la plantilla (només capçaleres)</a></p>
      <h2 style={{ fontSize: 16 }}>Columnes</h2>
      <table className="ws-table" style={{ marginBottom: 16 }}>
        <thead><tr><th scope="col"><span>Columna</span></th><th scope="col"><span>Què s&apos;hi escriu</span></th></tr></thead>
        <tbody>
          {e.fields.map((f) => (
            <tr key={f.name}><td style={{ padding: "6px 10px" }}><strong>{f.label}</strong>{f.required ? " *" : ""}</td>
              <td style={{ padding: "6px 10px" }}>{f.type === "relation" ? "El nom d'un registre que ja existeix (p. ex. el nom de l'empresa)" : f.type === "select" ? `Una d'aquestes: ${(f.choices ?? []).map(([, l]) => l).join(", ")}` : f.type === "checkbox" ? "Sí / No" : f.type === "date" ? "31/12/2026 o 2026-12-31" : f.type === "money" ? "Import en euros: 1.234,56" : f.type === "percent" ? "Percentatge: 21" : f.type === "number" ? "Nombre enter" : f.type === "email" ? "Adreça de correu" : f.type === "url" ? "Comença per https://" : "Text"}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="hint">* obligatòria. Les columnes que no coincideixin amb cap camp s&apos;ignoren.</p>
      <ImportForm entity={e.key} back={here} />
    </div>
  );
}
