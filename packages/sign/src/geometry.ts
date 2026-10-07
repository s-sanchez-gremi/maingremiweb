// A field is a box on a page, in PERCENT of the page (0 to 100), so it does not depend on the page size or the zoom.
export type FieldKind = "signature" | "initials" | "date" | "text";
export const FIELD_KINDS: FieldKind[] = ["signature", "initials", "date", "text"];
export const KIND_LABEL: Record<FieldKind, string> = { signature: "Signatura", initials: "Inicials", date: "Data", text: "Text" };

export type Box = { x: number; y: number; w: number; h: number };

/** Sensible first size of each kind, in percent of the page. */
export const DEFAULT_SIZE: Record<FieldKind, { w: number; h: number }> = {
  signature: { w: 30, h: 8 },
  initials: { w: 12, h: 6 },
  date: { w: 20, h: 4 },
  text: { w: 30, h: 4 },
};

const EPS = 1e-4;
export const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** numeric columns arrive from the database as strings */
export const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? NaN : Number(v));

export function inBounds(b: Box): boolean {
  const { x, y, w, h } = b;
  return [x, y, w, h].every(Number.isFinite) && x >= 0 && y >= 0 && w > 0 && h > 0 && w <= 100 && h <= 100 && x + w <= 100 + EPS && y + h <= 100 + EPS;
}

/** Puts a box of the kind's default size centred on a click (both in percent of the page), kept inside the page. */
export function placeAt(kind: FieldKind, clickX: number, clickY: number): Box {
  const { w, h } = DEFAULT_SIZE[kind];
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  return { x: round3(clamp(clickX - w / 2, 100 - w)), y: round3(clamp(clickY - h / 2, 100 - h)), w, h };
}

/** Reads a box from form values (strings, a comma allowed as decimal mark); null when anything is missing or outside the page. */
export function parseBox(v: { x?: unknown; y?: unknown; w?: unknown; h?: unknown }): Box | null {
  const n = (u: unknown) => Number(String(u ?? "").trim().replace(",", "."));
  const box = { x: round3(n(v.x)), y: round3(n(v.y)), w: round3(n(v.w)), h: round3(n(v.h)) };
  return inBounds(box) ? box : null;
}
