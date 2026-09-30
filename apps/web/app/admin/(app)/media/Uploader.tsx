"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function Uploader() {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setState({ busy: true });
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/media", { method: "POST", body });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Error en pujar el fitxer" }));
        setState({ busy: false, error: `${file.name}: ${error}` });
        return;
      }
    }
    if (input.current) input.current.value = "";
    setState({ busy: false });
    router.refresh();
  }

  return (
    <div className="card">
      <h3>Puja fitxers</h3>
      <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" onChange={(e) => upload(e.target.files)} disabled={state.busy} />
      <span className="hint">JPG, PNG, WebP, GIF o PDF · màx. 15 MB. Les imatges es converteixen a WebP en 3 mides.</span>
      {state.busy && <span role="status">Pujant…</span>}
      {state.error && <p role="alert" className="msg err">{state.error}</p>}
    </div>
  );
}
