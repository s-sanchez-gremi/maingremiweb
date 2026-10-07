import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { requireUser } from "@apex/core/auth";
import { forms } from "@apex/db/schema";
import { loadAnalytics } from "@apex/forms/admin-data";
import type { Item } from "@apex/forms/fieldTypes";

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)} %` : "—");
const time = (s: number) => (s < 90 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`);

/** A bar with its figures written next to it, so the chart never depends on colour or sight alone. */
function Bar({ value, of, label, note }: { value: number; of: number; label: string; note?: string }) {
  const width = of > 0 ? Math.max(value > 0 ? 2 : 0, Math.round((value / of) * 100)) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 220px) 1fr auto", gap: 8, alignItems: "center" }}>
      <span style={{ overflowWrap: "anywhere" }}>{label}</span>
      <span aria-hidden="true" style={{ background: "var(--paper-dark, #EFEAE0)", height: 12, borderRadius: 2, display: "block" }}>
        <span style={{ display: "block", width: `${width}%`, height: "100%", background: "var(--accent)", borderRadius: 2 }} />
      </span>
      <span className="hint" style={{ margin: 0, whiteSpace: "nowrap" }}>{value}{note ? ` · ${note}` : ""}</span>
    </div>
  );
}

export default async function Analytics({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [f] = await db.select().from(forms).where(eq(forms.id, id));
  if (!f) notFound();
  const a = await loadAnalytics(id, f.fields as Item[]);
  const maxDay = Math.max(1, ...a.perDay.map((d) => d.n));
  const hasReach = a.fields.some((x) => x.reached !== null);
  const choiceFields = a.fields.filter((x) => x.choices);

  return (
    <>
      <div className="top">
        <div><div className="crumb"><Link href="/admin/forms">Formularis</Link> / <Link href={`/admin/forms/${id}`}>{f.name}</Link></div><h1>Estadístiques</h1></div>
        <div className="row"><Link className="btn" href={`/admin/forms/${id}/submissions`}>Respostes</Link></div>
      </div>
      <div className="body" style={{ display: "grid", gap: 16, maxWidth: 960 }}>
        <div className="card" style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div><strong style={{ fontSize: 28 }}>{a.responses}</strong><div className="hint">respostes</div></div>
          <div><strong style={{ fontSize: 28 }}>{a.starts}</strong><div className="hint">han començat a omplir-lo</div></div>
          <div><strong style={{ fontSize: 28 }}>{a.completion === null ? "—" : `${Math.round(a.completion * 100)} %`}</strong><div className="hint">l&apos;acaben</div></div>
          <div>
            <strong style={{ fontSize: 28 }}>{a.duration ? time(a.duration.median) : "—"}</strong>
            <div className="hint">temps habitual per completar-lo{a.duration ? ` (mitjana ${time(a.duration.average)}, ${a.duration.n} respostes)` : ""}</div>
          </div>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          Les xifres són anònimes: no hi ha cap galeta ni res que identifiqui qui ho omple. El temps compta des que la persona toca el formulari per primer cop fins que l&apos;envia (les respostes anteriors a aquesta funció no en tenen).
        </p>

        <div className="card">
          <h3>Respostes els últims 30 dies</h3>
          <div role="img" aria-label={`Respostes per dia els últims 30 dies: ${a.perDay.reduce((s, d) => s + d.n, 0)} en total`} style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80 }}>
            {a.perDay.map((d) => <span key={d.day} title={`${d.day}: ${d.n}`} style={{ flex: 1, height: `${(d.n / maxDay) * 100}%`, minHeight: d.n ? 3 : 1, background: d.n ? "var(--accent)" : "var(--border, #D8D0C1)" }} />)}
          </div>
          <div className="row hint" style={{ margin: 0 }}><span>{a.perDay[0]?.day}</span><span>{a.perDay[a.perDay.length - 1]?.day}</span></div>
        </div>

        <div className="card" style={{ display: "grid", gap: 8 }}>
          <h3>Pregunta a pregunta</h3>
          <p className="hint" style={{ margin: 0 }}>
            «Hi arriben» són les vegades que algú ha arribat a la pregunta (la primera vegada que la toca) i «responen» les respostes que la contesten.
            Una caiguda forta entre dues preguntes seguides indica on la gent abandona.
            {!hasReach && " Encara no hi ha dades d'arribada: es recullen a partir d'ara."}
          </p>
          {a.fields.length === 0 && <p className="hint">Aquest formulari no té preguntes.</p>}
          {a.fields.map((x, i) => {
            const prev = a.fields[i - 1]?.reached ?? null;
            const lost = x.reached !== null && prev !== null && prev > 0 ? Math.round(((prev - x.reached) / prev) * 100) : null;
            return (
              <div key={x.id} style={{ display: "grid", gap: 4 }}>
                <Bar value={x.reached ?? 0} of={a.starts} label={x.label} note={x.reached === null ? "sense dades d'arribada" : `hi arriben · ${pct(x.reached, a.starts)} dels inicis${lost !== null && lost > 0 ? ` · −${lost} % respecte l'anterior` : ""}`} />
                <span className="hint" style={{ margin: 0 }}>{x.answered} responen ({pct(x.answered, a.responses)} de les respostes)</span>
              </div>
            );
          })}
        </div>

        {choiceFields.map((x) => {
          const total = x.choices!.reduce((s, c) => s + c.count, 0);
          return (
            <div key={x.id} className="card" style={{ display: "grid", gap: 6 }}>
              <h3>{x.label}</h3>
              {x.average !== null && <p className="hint" style={{ margin: 0 }}>Nota mitjana: {x.average}</p>}
              {x.choices!.map((c) => <Bar key={c.label} value={c.count} of={Math.max(total, 1)} label={c.label} note={pct(c.count, total)} />)}
              {total === 0 && <p className="hint">Encara no hi ha respostes a aquesta pregunta.</p>}
            </div>
          );
        })}
      </div>
    </>
  );
}
