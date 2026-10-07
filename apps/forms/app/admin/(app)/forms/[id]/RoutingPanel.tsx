"use client";
// The editor panel for destination "records": what the CRM creates from each response, and which field of the form fills each of its values.
// What can be created is declared in packages/forms/src/routing.ts (shared with the CRM app, which does the work).
import { formTypeByName, lt, type Item } from "@apex/forms/fieldTypes";
import { routingTarget, routingTargets, type Routing, type TargetKey } from "@apex/forms/routing";

export type EventChoice = { id: string; label: string };

export function RoutingPanel({ value, onChange, items, events }: { value: Routing | null; onChange: (r: Routing | null) => void; items: Item[]; events: EventChoice[] }) {
  const target = routingTarget(value?.target);
  const answerable = items.filter((i) => formTypeByName[i.type]?.input && i.type !== "file");
  const nameOf = (i: Item) => lt(i.data.label, "ca") || formTypeByName[i.type].label;
  const set = (patch: Partial<Routing>) => value && onChange({ ...value, ...patch });

  return (
    <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
      <label>Què es crea al CRM amb cada resposta
        <select value={value?.target ?? ""} onChange={(e) => {
          const key = e.target.value as TargetKey | "";
          const next = routingTarget(key);
          if (!next) return onChange(null);
          const keep = (src: Record<string, string> | undefined, names: string[]) => Object.fromEntries(names.filter((n) => src?.[n]).map((n) => [n, src![n]]));
          onChange({ target: next.key, map: keep(value?.map, next.map.map((m) => m.name)), fixed: keep(value?.fixed, next.fixed.map((f) => f.name)) });
        }}>
          <option value="">— tria —</option>
          {routingTargets.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </label>
      {target && value && (
        <>
          <span className="hint">{target.description}</span>
          {target.fixed.map((f) => (
            <label key={f.name}>{f.label}{f.required ? " *" : ""}
              <select value={value.fixed[f.name] ?? f.default ?? ""} onChange={(e) => set({ fixed: { ...value.fixed, [f.name]: e.target.value } })}>
                {!f.default && <option value="">— tria —</option>}
                {f.kind === "event" ? events.map((ev) => <option key={ev.id} value={ev.id}>{ev.label}</option>) : f.choices?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {f.kind === "event" && events.length === 0 && <span className="hint">Encara no hi ha cap esdeveniment: crea&apos;n un a l&apos;espai de treball del CRM.</span>}
            </label>
          ))}
          <strong style={{ fontSize: 13 }}>Quin camp del formulari omple cada dada</strong>
          {target.map.map((m) => (
            <label key={m.name}>{m.label}{m.required ? " *" : ""}
              <select value={value.map[m.name] ?? ""} onChange={(e) => set({ map: { ...value.map, [m.name]: e.target.value } })}>
                <option value="">— no es desa —</option>
                {answerable.map((i) => <option key={i.id} value={i.id}>{nameOf(i)}</option>)}
              </select>
            </label>
          ))}
          <span className="hint">El CRM crea els registres uns instants després d&apos;arribar la resposta (normalment menys d&apos;un minut). A cada resposta veuràs si ja s&apos;han creat, o si ha fallat i per què.</span>
        </>
      )}
    </div>
  );
}
