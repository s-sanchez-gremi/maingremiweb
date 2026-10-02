// Bar chart view: how many records have each value of a field, for the current search, filters and tab (Notion's "donut by activity",
// as flat bars: easier to read and to compare). A bar links to the table filtered to that value when the field can be filtered.
import Link from "next/link";
import type { Tone } from "@/lib/records/tones";

export type Bar = { key: string; label: string; n: number; tone?: Tone; href?: string };
const SHOWN = 24;

export function Chart({ label, bars, total }: { label: string; bars: Bar[]; total: number }) {
  const top = bars.slice(0, SHOWN);
  const rest = bars.slice(SHOWN).reduce((s, b) => s + b.n, 0);
  const max = Math.max(1, ...top.map((b) => b.n));
  if (bars.length === 0) return <p className="ws-hint">No hi ha dades per mostrar.</p>;
  return (
    <figure className="ws-chart">
      <figcaption>{label} <span>{total.toLocaleString("ca-ES")} en total</span></figcaption>
      <ul>
        {top.map((b) => {
          const inner = (
            <>
              <span className="ws-bar-label">{b.label}</span>
              <span className="ws-bar-track" aria-hidden><i data-tone={b.tone} style={{ width: `${Math.max(1.5, (b.n / max) * 100)}%` }} /></span>
              <span className="ws-bar-n">{b.n.toLocaleString("ca-ES")}<small>{Math.round((b.n / Math.max(1, total)) * 100)}%</small></span>
            </>
          );
          return <li key={b.key}>{b.href ? <Link href={b.href} title="Mostra'ls a la taula">{inner}</Link> : <div>{inner}</div>}</li>;
        })}
      </ul>
      {rest > 0 && <p className="ws-hint">+ {bars.length - SHOWN} valors més ({rest.toLocaleString("ca-ES")} registres).</p>}
    </figure>
  );
}
