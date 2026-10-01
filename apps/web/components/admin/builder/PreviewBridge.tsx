"use client";
// Runs inside the editor's preview iframe (/admin/preview/...). It never changes content itself: it reports clicks and
// drops to the editor (same origin only) and draws outlines / the drop line. All editing happens in the parent.
import { useEffect } from "react";

export type ToEditor =
  | { apex: "select"; id: string }
  | { apex: "drop"; payload: string; target: { index: number } | { section: string; col: string; index: number } };
export type ToPreview = { apex: "selected"; id: string | null };

const STYLES = `
[data-section-id],[data-block-id]{position:relative;cursor:pointer}
[data-section-id]:hover{outline:2px dashed rgba(213,0,50,.45);outline-offset:-2px}
[data-block-id]:hover{outline:2px dashed rgba(213,0,50,.7);outline-offset:4px}
.apex-sel{outline:3px solid #D50032!important;outline-offset:-3px}
[data-block-id].apex-sel{outline-offset:4px}
.apex-drop{position:absolute;height:4px;background:#D50032;border-radius:2px;pointer-events:none;z-index:9999;box-shadow:0 0 0 2px #fff}
.apex-empty-col{min-height:80px;border:2px dashed rgba(138,135,128,.6);border-radius:8px;display:grid;place-items:center;color:#5C5A54;font:14px system-ui}
.apex-empty-page{margin:48px auto;max-width:640px;padding:48px;border:2px dashed rgba(138,135,128,.6);border-radius:10px;text-align:center;color:#5C5A54;font:16px system-ui}
`;
const MIME = "application/x-apex";
const SCROLL_KEY = "apex-preview-scroll";

type DropTarget = Extract<ToEditor, { apex: "drop" }>["target"];
function dropTarget(e: DragEvent): { target: DropTarget; line: DOMRect } | null {
  const el = e.target as Element | null;
  const col = el?.closest?.("[data-col]") as HTMLElement | null;
  const sec = el?.closest?.("[data-section-id]") as HTMLElement | null;
  if (col && sec) {
    const blocks = [...col.querySelectorAll<HTMLElement>(":scope > [data-block-id]")];
    let index = blocks.length;
    for (let i = 0; i < blocks.length; i++) {
      const r = blocks[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { index = i; break; }
    }
    const cr = col.getBoundingClientRect();
    const y = index < blocks.length ? blocks[index].getBoundingClientRect().top - 8 : (blocks.length ? blocks[blocks.length - 1].getBoundingClientRect().bottom + 8 : cr.top + 8);
    return { target: { section: sec.dataset.sectionId!, col: col.dataset.col!, index }, line: new DOMRect(cr.left, y, cr.width, 4) };
  }
  const sections = [...document.querySelectorAll<HTMLElement>("main [data-section-id]")];
  let index = sections.length;
  for (let i = 0; i < sections.length; i++) {
    const r = sections[i].getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) { index = i; break; }
  }
  const main = document.querySelector("main")!.getBoundingClientRect();
  const y = index < sections.length ? sections[index].getBoundingClientRect().top : (sections.length ? sections[sections.length - 1].getBoundingClientRect().bottom : main.top + 20);
  return { target: { index }, line: new DOMRect(main.left + 16, y - 2, main.width - 32, 4) };
}

export function PreviewBridge() {
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = STYLES;
    document.head.appendChild(style);
    const send = (m: ToEditor) => window.parent.postMessage(m, location.origin);

    try { const y = Number(sessionStorage.getItem(SCROLL_KEY)); if (y) window.scrollTo(0, y); } catch { /* storage blocked: start at top */ }
    const saveScroll = () => { try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY)); } catch { /* ignore */ } };
    window.addEventListener("scroll", saveScroll, { passive: true });

    // Empty columns and an empty page need a visible place to drop into.
    document.querySelectorAll<HTMLElement>("[data-col]").forEach((c) => {
      if (!c.querySelector("[data-block-id]")) { const d = document.createElement("div"); d.className = "apex-empty-col"; d.textContent = "Arrossega un bloc aquí"; c.appendChild(d); }
    });
    const main = document.querySelector("main");
    if (main && !main.querySelector("[data-section-id]")) { const d = document.createElement("div"); d.className = "apex-empty-page"; d.textContent = "Pàgina buida: arrossega un bloc o una secció des de l'esquerra."; main.appendChild(d); }

    // Existing sections and blocks can be dragged too.
    document.querySelectorAll<HTMLElement>("[data-section-id],[data-block-id]").forEach((n) => { n.draggable = true; });
    const onDragStart = (e: DragEvent) => {
      const n = (e.target as Element).closest?.("[data-block-id],[data-section-id]") as HTMLElement | null;
      if (!n || !e.dataTransfer) return;
      e.stopPropagation();
      const payload = n.dataset.blockId ? { kind: "move-block", id: n.dataset.blockId } : { kind: "move-section", id: n.dataset.sectionId };
      e.dataTransfer.setData(MIME, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "move";
    };

    const line = document.createElement("div");
    line.className = "apex-drop";
    const hide = () => line.remove();
    const onOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes(MIME)) return;
      e.preventDefault();
      const t = dropTarget(e);
      if (!t) return hide();
      Object.assign(line.style, { left: `${t.line.left + scrollX}px`, top: `${t.line.top + scrollY}px`, width: `${t.line.width}px` });
      if (!line.isConnected) document.body.appendChild(line);
    };
    const onDrop = (e: DragEvent) => {
      const payload = e.dataTransfer?.getData(MIME);
      hide();
      if (!payload) return;
      e.preventDefault();
      const t = dropTarget(e);
      if (t) send({ apex: "drop", payload, target: t.target });
    };

    const onClick = (e: MouseEvent) => {
      e.preventDefault(); // nothing in the preview navigates or submits
      const n = (e.target as Element).closest?.("[data-block-id],[data-section-id]") as HTMLElement | null;
      if (n) send({ apex: "select", id: n.dataset.blockId ?? n.dataset.sectionId! });
    };
    const onMessage = (e: MessageEvent<ToPreview>) => {
      if (e.origin !== location.origin || e.data?.apex !== "selected") return;
      document.querySelectorAll(".apex-sel").forEach((x) => x.classList.remove("apex-sel"));
      if (e.data.id) document.querySelector(`[data-block-id="${CSS.escape(e.data.id)}"],[data-section-id="${CSS.escape(e.data.id)}"]`)?.classList.add("apex-sel");
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", (e) => e.preventDefault(), true);
    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("dragover", onOver);
    document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) hide(); });
    document.addEventListener("drop", onDrop);
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ apex: "ready" }, location.origin);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("dragover", onOver);
      document.removeEventListener("drop", onDrop);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("scroll", saveScroll);
    };
  }, []);
  return null;
}
