"use client";
// "Columnes": which columns the table shows. Remembered per database in a first-party cookie the server reads (like the sidebar).
import { useRouter } from "next/navigation";
import { Icon } from "./icons";

export type ColumnOption = { key: string; label: string; locked?: boolean; computed?: boolean };

function saveColumns(entity: string, keys: string[] | null) {
  document.cookie = `ws_cols_${entity}=${keys ? encodeURIComponent(keys.join(",")) : ""}; path=/workspace; max-age=${keys ? 31536000 : 0}; samesite=lax`;
}

export function ColumnsMenu({ entity, options, visible, isDefault, sets }: { entity: string; options: ColumnOption[]; visible: string[]; isDefault: boolean; sets?: { label: string; keys: string[] }[] }) {
  const router = useRouter();
  const write = (keys: string[] | null) => {
    saveColumns(entity, keys);
    router.refresh();
  };
  return (
    <details className="ws-menu ws-cols">
      <summary className="ws-chip" aria-label="Columnes"><Icon name="columns" size={14} />Columnes<span className="ws-chip-n">{visible.length}</span></summary>
      <div role="group" aria-label="Columnes visibles">
        {sets && sets.length > 0 && (
          <div className="ws-presets" role="group" aria-label="Conjunts de columnes">
            {sets.map((st) => {
              const on = st.keys.length === visible.length && st.keys.every((k) => visible.includes(k));
              return <button key={st.label} type="button" aria-pressed={on} onClick={() => write(st.keys)}>{st.label}</button>;
            })}
          </div>
        )}
        {options.map((o, i) => (
          <label key={o.key} className={o.computed && !options[i - 1]?.computed ? "sep" : undefined}>
            <input
              type="checkbox" checked={visible.includes(o.key)} disabled={o.locked}
              onChange={(ev) => write(options.filter((x) => x.locked || (x.key === o.key ? ev.target.checked : visible.includes(x.key))).map((x) => x.key))}
            />
            <span>{o.label}</span>{o.computed && <em>calculada</em>}
          </label>
        ))}
        {!isDefault && <button type="button" onClick={() => write(null)}>Restableix</button>}
      </div>
    </details>
  );
}
