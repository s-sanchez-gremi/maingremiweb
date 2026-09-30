"use client";
// Desktop menu with dropdowns, built as an accessible "disclosure" navigation: each parent is a real button with
// aria-expanded, Enter/Space opens it, Escape closes it and returns focus, Tab moves through the links, and it also
// opens on mouse hover. No hidden content is focusable.
import { useEffect, useId, useRef, useState } from "react";
import { SmartLink } from "./SmartLink";

export type NavEntry = { label: string; url: string; children: { label: string; url: string }[] };

export function NavDesktop({ items, label }: { items: NavEntry[]; label: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const root = useRef<HTMLElement>(null);
  const base = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  return (
    <nav ref={root} className="nav-desktop" aria-label={label}
      onKeyDown={(e) => { if (e.key === "Escape" && open !== null) { const i = open; setOpen(null); buttons.current[i]?.focus(); } }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(null); }}>
      <ul>
        {items.map((it, i) => it.children.length === 0 ? (
          <li key={i}><SmartLink href={it.url}>{it.label}</SmartLink></li>
        ) : (
          <li key={i} className="has-sub" onMouseEnter={() => setOpen(i)} onMouseLeave={() => setOpen((o) => (o === i ? null : o))}>
            <button type="button" ref={(el) => { buttons.current[i] = el; }} aria-expanded={open === i} aria-controls={`${base}-${i}`}
              onClick={() => setOpen(open === i ? null : i)}>
              {it.label}
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <ul id={`${base}-${i}`} className="submenu" hidden={open !== i}>
              {it.children.map((c, j) => <li key={j}><SmartLink href={c.url}>{c.label}</SmartLink></li>)}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
