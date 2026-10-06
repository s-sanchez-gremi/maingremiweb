"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const ACCEPT = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", ".docx", ".xlsx", ".pptx",
].join(",");

/** One file at a time to /api/media (the server checks every file), with progress. A failed file never stops the others. */
function send(file: File, onProgress: (pct: number) => void): Promise<string | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.append("file", file);
    xhr.open("POST", "/api/media");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(null);
      try { resolve(JSON.parse(xhr.responseText).error ?? "Error en pujar el fitxer"); } catch { resolve("Error en pujar el fitxer"); }
    };
    xhr.onerror = () => resolve("No s'ha pogut connectar");
    xhr.send(body);
  });
}

export function Uploader() {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState<{ name: string; pct: number; n: number; of: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [over, setOver] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length || busy) return;
    const list = Array.from(files);
    const failed: string[] = [];
    for (const [i, file] of list.entries()) {
      setBusy({ name: file.name, pct: 0, n: i + 1, of: list.length });
      const error = await send(file, (pct) => setBusy({ name: file.name, pct, n: i + 1, of: list.length }));
      if (error) failed.push(`${file.name}: ${error}`);
    }
    if (input.current) input.current.value = "";
    setBusy(null);
    setErrors(failed);
    router.refresh();
  }

  return (
    <div
      className="card"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
      style={{ border: `2px dashed ${over ? "var(--accent)" : "var(--field-border)"}`, background: over ? "var(--bg2)" : "#fff", textAlign: "center", padding: 28 }}
    >
      <strong>Arrossega aquí els fitxers</strong>
      <label style={{ justifySelf: "center" }}>
        <span className="sr-only">Tria fitxers per pujar</span>
        <input ref={input} type="file" multiple accept={ACCEPT} onChange={(e) => upload(e.target.files)} disabled={!!busy} />
      </label>
      <span className="hint">Imatges (JPG, PNG, WebP, GIF), PDF, Word, Excel o PowerPoint · màx. 15 MB per fitxer. Les imatges es converteixen a WebP. Tot el que pugis aquí és públic per a qui tingui l&apos;enllaç.</span>
      {busy && (
        <div role="status" style={{ display: "grid", gap: 6 }}>
          <span>Pujant {busy.n} de {busy.of}: {busy.name}</span>
          <progress max={100} value={busy.pct} style={{ width: "100%" }} aria-label="Progrés de la pujada" />
        </div>
      )}
      {errors.length > 0 && <div role="alert" className="msg err">{errors.map((e) => <p key={e}>{e}</p>)}</div>}
    </div>
  );
}
