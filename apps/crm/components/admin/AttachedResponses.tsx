import type { Answer } from "@apex/db/schema";
import { formsHref } from "@/lib/forms-link";

export type AttachedRow = { id: string; createdAt: Date; formId: string; formName: string | null; answers: Answer[]; projectName?: string | null };

const text = (a: Answer) => {
  const v = a.value as unknown;
  if (a.type === "file" && v && typeof v === "object") return (v as { name?: string }).name ?? "";
  return Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Sí" : "No") : String(v ?? "");
};

/** Responses that forms attached to a project or client. */
export function AttachedResponses({ rows }: { rows: AttachedRow[] }) {
  return (
    <div className="card">
      <h3>Respostes de formularis adjuntades ({rows.length})</h3>
      {rows.length === 0 && <p className="hint">Encara no n&apos;hi ha cap. Configura un formulari amb la destinació «Adjuntar a un projecte o client».</p>}
      {rows.map((r) => (
        <div key={r.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "grid", gap: 4 }}>
          <div className="row">
            <strong>{r.createdAt.toLocaleString("ca-ES", { dateStyle: "medium", timeStyle: "short" })}</strong>
            <a href={formsHref(`/admin/forms/${r.formId}/submissions`)} className="hint">{r.formName}{r.projectName ? ` · ${r.projectName}` : ""}</a>
          </div>
          <div style={{ fontSize: 13, overflowWrap: "anywhere" }}>{r.answers.slice(0, 4).map((a) => `${a.label}: ${text(a)}`).join(" · ")}</div>
        </div>
      ))}
    </div>
  );
}
