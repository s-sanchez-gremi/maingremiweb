"use client";
// The one ordered-list editor: add, move up/down, remove. Used for page sections and nested lists
// (and later form fields and nav links). No drag-and-drop by design.
import type { ReactNode } from "react";

type Add<T> =
  | { options: { value: string; label: string }[]; make: (value: string) => T; label?: string }
  | { label: string; make: () => T };

export function ListEditor<T>({ items, onChange, title, render, add }: {
  items: T[];
  onChange: (items: T[]) => void;
  title: (item: T, index: number) => string;
  render: (item: T, update: (next: T) => void) => ReactNode;
  add: Add<T>;
}) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <>
      {items.map((item, i) => (
        <div className="card" key={i}>
          <div className="row">
            <span className="chip">{title(item, i)}</span>
            <div className="tools">
              <button type="button" aria-label="Amunt" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" aria-label="Avall" disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" aria-label="Elimina" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
            </div>
          </div>
          {render(item, (next) => onChange(items.map((x, j) => (j === i ? next : x))))}
        </div>
      ))}
      <div className="add">
        {"options" in add ? (
          <>
            <strong>+ {add.label ?? "Afegeix una secció"}</strong>
            {add.options.map((o) => (
              <button type="button" key={o.value} onClick={() => onChange([...items, add.make(o.value)])}>{o.label}</button>
            ))}
          </>
        ) : (
          <button type="button" onClick={() => onChange([...items, add.make()])}>+ {add.label}</button>
        )}
      </div>
    </>
  );
}
