"use client";
import { useState } from "react";
import { FieldForm, type Options } from "@apex/ui/components/FieldForm";
import { settingsFields } from "@/lib/settings-schema";
import { saveSettings } from "./actions";

export function SettingsEditor({ initial, options, message }: {
  initial: Record<string, unknown>; options: Options; message: { kind: "ok" | "err"; text: string } | null;
}) {
  const [data, setData] = useState(initial);
  return (
    <form action={saveSettings}>
      <input type="hidden" name="data" value={JSON.stringify(data)} />
      <div className="top">
        <h1>Configuració del web</h1>
        <button className="btn primary" type="submit">Desa</button>
      </div>
      <div className="body">
        {message && <p role="status" className={`msg ${message.kind}`} style={{ marginTop: 0 }}>{message.text}</p>}
        <div className="card" style={{ maxWidth: 760 }}>
          <FieldForm fields={settingsFields} data={data} onChange={setData} options={options} />
        </div>
      </div>
    </form>
  );
}
