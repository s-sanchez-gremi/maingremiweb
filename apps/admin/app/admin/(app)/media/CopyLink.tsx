"use client";
import { useState } from "react";

/** The file's public link, visible and selectable, with a button that copies it. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy(input: HTMLInputElement | null) {
    try { await navigator.clipboard.writeText(url); }
    catch { input?.select(); document.execCommand("copy"); } // older browsers / clipboard blocked
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label>Enllaç públic<input readOnly value={url} onFocus={(e) => e.currentTarget.select()} /></label>
      <button className="btn primary" type="button" onClick={(e) => copy(e.currentTarget.parentElement?.querySelector("input") ?? null)}>
        {copied ? "✓ Enllaç copiat" : "Copia l'enllaç"}
      </button>
      <span role="status" className="sr-only">{copied ? "Enllaç copiat" : ""}</span>
    </div>
  );
}
