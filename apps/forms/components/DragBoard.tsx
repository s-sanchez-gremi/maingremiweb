"use client";
// Drag a response card onto another lane of the board. It only does what the card's own "Mou a" form does (the form is the real, keyboard-friendly way
// and works without JavaScript): on drop it picks the lane in that form and submits it, so the server action checks everything the same way.
import { useRef } from "react";

export function DragBoard({ children }: { children: React.ReactNode }) {
  const dragged = useRef<HTMLElement | null>(null);
  const target = (e: React.DragEvent) => e.target instanceof Element ? e.target : null;
  return (
    <div
      style={{ display: "flex", gap: 12, overflowX: "auto", alignItems: "flex-start" }}
      onDragStart={(e) => {
        const card = target(e)?.closest<HTMLElement>("[data-card]");
        if (!card) return;
        dragged.current = card;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.dataset.card ?? "");
      }}
      onDragEnd={() => { dragged.current = null; }}
      onDragOver={(e) => { if (dragged.current && target(e)?.closest("[data-lane]")) e.preventDefault(); }}
      onDrop={(e) => {
        const lane = target(e)?.closest<HTMLElement>("[data-lane]"), card = dragged.current;
        dragged.current = null;
        if (!lane || !card) return;
        e.preventDefault();
        const form = card.querySelector("form");
        const select = form?.elements.namedItem("to");
        const to = lane.dataset.lane ?? "";
        if (!form || !(select instanceof HTMLSelectElement) || card.closest("[data-lane]") === lane) return; // dropped where it already is
        if (![...select.options].some((o) => o.value === to)) return; // not a lane it can go to
        select.value = to;
        form.requestSubmit();
      }}
    >
      {children}
    </div>
  );
}
