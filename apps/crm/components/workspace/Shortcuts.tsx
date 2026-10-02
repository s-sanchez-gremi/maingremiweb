"use client";
// Keyboard: "/" jumps to the search box, Esc closes an open menu, then the side panel. Ignored while typing in a field.
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
        const menu = document.querySelector<HTMLDetailsElement>(".ws-menu[open]");
        if (menu) { menu.open = false; menu.querySelector("summary")?.focus(); return; }
        if (typing && t && t.tagName !== "SELECT") { (t as HTMLInputElement).blur(); return; }
        document.querySelector<HTMLAnchorElement>("a.ws-close")?.click();
      }
    };
    const onClick = (e: MouseEvent) => {
      const menu = document.querySelector<HTMLDetailsElement>(".ws-menu[open]");
      if (menu && !menu.contains(e.target as Node)) menu.open = false;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick); };
  }, []);
  return null;
}
