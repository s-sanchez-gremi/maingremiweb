"use client";
// Board view: one column per choice of a select field; drag a card to another column to change that field (same save, validation and history as editing the cell).
// Keyboard and screen readers: every card has a "Mou a" menu that does the same.
import Link from "next/link";
import { useState, useTransition } from "react";
import { saveCellAction } from "@/lib/records/actions";
import { toneOf } from "@/lib/records/tones";

export type BoardColumn = { value: string; label: string };
export type BoardCard = { id: string; title: string; meta: string[]; value: string; href: string };

export function Board({ entity, field, fieldLabel, columns, cards: initial, openId }: { entity: string; field: string; fieldLabel: string; columns: BoardColumn[]; cards: BoardCard[]; openId: string | null }) {
  const [cards, setCards] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [, start] = useTransition();

  const move = (id: string, value: string) => {
    const card = cards.find((c) => c.id === id);
    if (!card || card.value === value) return;
    const before = cards;
    setCards([{ ...card, value }, ...cards.filter((c) => c.id !== id)]);
    setError("");
    start(async () => {
      const r = await saveCellAction(entity, id, field, value);
      if (!r.ok) { setCards(before); setError(r.error); }
    });
  };

  return (
    <>
      {error && <p role="alert" className="msg err">{error}</p>}
      <div className="ws-board" role="group" aria-label={`Tauler per ${fieldLabel.toLowerCase()}`}>
        {columns.map((col) => {
          const mine = cards.filter((c) => c.value === col.value);
          return (
            <section
              key={col.value || "none"} className="ws-col" data-over={over === col.value ? "" : undefined} aria-label={`${col.label}: ${mine.length}`}
              onDragOver={(e) => { e.preventDefault(); setOver(col.value); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, col.value); }}
            >
              <header><span className="ws-pill" data-tone={toneOf(col.value)}>{col.label}</span><span className="ws-col-n">{mine.length}</span></header>
              <div className="ws-col-body">
                {mine.map((c) => (
                  <article key={c.id} className="ws-card" draggable aria-current={openId === c.id ? "true" : undefined} onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; }}>
                    <Link href={c.href} className="ws-card-title">{c.title}</Link>
                    {c.meta.length > 0 && <ul>{c.meta.map((m, i) => <li key={i}>{m}</li>)}</ul>}
                    <label className="ws-card-move">
                      <span className="sr-only">Mou «{c.title}» a</span>
                      <select value={c.value} onChange={(e) => move(c.id, e.target.value)}>
                        {columns.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                  </article>
                ))}
                {mine.length === 0 && <p className="ws-col-empty">Res aquí</p>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
