"use client";
// Folds one group of rows of the table (the rows stay in the page, only hidden).
import { Icon } from "./icons";

export function GroupToggle({ label, count }: { label: string; count: number }) {
  return (
    <button
      type="button" className="ws-group-btn" aria-expanded="true"
      onClick={(e) => {
        const body = e.currentTarget.closest("tbody");
        if (!body) return;
        const folded = body.toggleAttribute("data-folded");
        e.currentTarget.setAttribute("aria-expanded", String(!folded));
      }}
    >
      <Icon name="next" size={13} /><strong>{label}</strong><span>{count.toLocaleString("ca-ES")}</span>
    </button>
  );
}
