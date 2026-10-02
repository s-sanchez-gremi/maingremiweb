"use client";
// Keyboard: "/" jumps to the search box, Esc closes the side panel. Ignored while typing in a field.
import { useEffect } from "react";

export function Shortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const q = document.querySelector<HTMLInputElement>("#ws-q");
        if (q) { e.preventDefault(); q.focus(); q.select(); }
      } else if (e.key === "Escape") {
        if (typing && t && t.tagName !== "SELECT") { (t as HTMLInputElement).blur(); return; }
        document.querySelector<HTMLAnchorElement>("a.ws-close")?.click();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
