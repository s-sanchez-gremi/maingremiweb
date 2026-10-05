// Pure edit operations of the visual page builder (no React, no DOM), so they are unit-tested.
// A page is an ordered list of sections; a "columns" section holds blocks in c1..c4.
import { COLUMN_FIELDS, blockByName, columnCount } from "@apex/sections/blocks";
import { sectionByName } from "@apex/sections/registry";
import type { Field } from "@apex/core/fields";

export type Data = Record<string, unknown>;
export type BlockItem = { id: string; type: string; data: Data };
export type SectionItem = { id: string; type: string; data: Data; style?: Record<string, string> };
export type Col = (typeof COLUMN_FIELDS)[number];
/** Where something is dropped: before section `index`, or into column `col` of section `section` before block `index`. */
export type Target = { section?: undefined; index: number } | { section: string; col: Col; index: number };

const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

export function emptyFor(fields: Field[]): Data {
  return Object.fromEntries(fields.map((f) => [f.name, f.kind === "list" || f.kind === "blocks" ? [] : f.kind === "ltext" || f.kind === "ltextarea" ? { ca: "", es: "", en: "" } : f.kind === "select" ? f.options[0].value : ""]));
}
export const newSection = (type: string, data?: Data): SectionItem => ({ id: uid(), type, data: data ?? emptyFor(sectionByName[type]?.fields ?? []) });
export const newBlock = (type: string): BlockItem => ({ id: uid(), type, data: emptyFor(blockByName[type]?.fields ?? []) });
/** A one-column "Columnes" section wrapping one block (a block dropped between sections). */
export const wrapBlock = (b: BlockItem): SectionItem => newSection("columns", { ...emptyFor(sectionByName.columns.fields), layout: "1", c1: [b] });

const blocksOf = (s: SectionItem, c: Col) => (Array.isArray(s.data[c]) ? (s.data[c] as BlockItem[]) : []);

export function findBlock(sections: SectionItem[], blockId: string): { section: SectionItem; col: Col; index: number; block: BlockItem } | null {
  for (const s of sections) if (s.type === "columns") for (const c of COLUMN_FIELDS) {
    const i = blocksOf(s, c).findIndex((b) => b.id === blockId);
    if (i >= 0) return { section: s, col: c, index: i, block: blocksOf(s, c)[i] };
  }
  return null;
}

function insertAt(sections: SectionItem[], t: Target, item: { block?: BlockItem; section?: SectionItem }): SectionItem[] {
  if (t.section === undefined) {
    const s = item.section ?? wrapBlock(item.block!);
    const next = [...sections];
    next.splice(Math.max(0, Math.min(t.index, next.length)), 0, s);
    return next;
  }
  const host = sections.find((s) => s.id === t.section);
  if (!host || host.type !== "columns") return sections;
  if (item.section) { // a section dropped inside a column goes right after that columns section
    const i = sections.indexOf(host);
    return [...sections.slice(0, i + 1), item.section, ...sections.slice(i + 1)];
  }
  return sections.map((s) => {
    if (s.id !== host.id) return s;
    const list = [...blocksOf(s, t.col)];
    list.splice(Math.max(0, Math.min(t.index, list.length)), 0, item.block!);
    return { ...s, data: { ...s.data, [t.col]: list } };
  });
}

export const insertSection = (sections: SectionItem[], section: SectionItem, t: Target) => insertAt(sections, t, { section });
export const insertBlock = (sections: SectionItem[], block: BlockItem, t: Target) => insertAt(sections, t, { block });
export const addSection = (sections: SectionItem[], type: string, t: Target) => insertSection(sections, newSection(type), t);
export const addBlock = (sections: SectionItem[], type: string, t: Target) => insertBlock(sections, newBlock(type), t);

export function removeSection(sections: SectionItem[], id: string) { return sections.filter((s) => s.id !== id); }
export function removeBlock(sections: SectionItem[], blockId: string): SectionItem[] {
  return sections.map((s) => s.type !== "columns" ? s : { ...s, data: { ...s.data, ...Object.fromEntries(COLUMN_FIELDS.map((c) => [c, blocksOf(s, c).filter((b) => b.id !== blockId)])) } });
}

export function moveSection(sections: SectionItem[], id: string, toIndex: number): SectionItem[] {
  const from = sections.findIndex((s) => s.id === id);
  if (from < 0) return sections;
  const next = [...sections];
  const [s] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(toIndex > from ? toIndex - 1 : toIndex, next.length)), 0, s);
  return next;
}

export function moveBlock(sections: SectionItem[], blockId: string, t: Target): SectionItem[] {
  const found = findBlock(sections, blockId);
  if (!found) return sections;
  let index = t.index; // the drop index was measured with the block still in place
  if (t.section === found.section.id && t.col === found.col && index > found.index) index -= 1;
  return insertAt(removeBlock(sections, blockId), { ...t, index } as Target, { block: found.block });
}

/** ↑ / ↓ for keyboard users: a block moves within its column; a section within the page. */
export function nudge(sections: SectionItem[], id: string, d: -1 | 1): SectionItem[] {
  const f = findBlock(sections, id);
  if (f) {
    const list = blocksOf(f.section, f.col);
    const j = f.index + d;
    if (j < 0 || j >= list.length) return sections;
    return moveBlock(sections, id, { section: f.section.id, col: f.col, index: d > 0 ? j + 1 : j });
  }
  const i = sections.findIndex((s) => s.id === id);
  if (i < 0 || i + d < 0 || i + d >= sections.length) return sections;
  return moveSection(sections, id, d > 0 ? i + 2 : i - 1);
}

export function duplicate(sections: SectionItem[], id: string): SectionItem[] {
  const f = findBlock(sections, id);
  if (f) return insertAt(sections, { section: f.section.id, col: f.col, index: f.index + 1 }, { block: { ...structuredClone(f.block), id: uid() } });
  const i = sections.findIndex((s) => s.id === id);
  if (i < 0) return sections;
  const copy = structuredClone(sections[i]);
  if (copy.type === "columns") for (const c of COLUMN_FIELDS) copy.data[c] = blocksOf(copy, c).map((b) => ({ ...b, id: uid() }));
  return [...sections.slice(0, i + 1), { ...copy, id: uid() }, ...sections.slice(i + 1)];
}

/** Changing to fewer columns moves the blocks of the dropped columns into the last remaining one (nothing is lost). */
export function setLayout(s: SectionItem, layout: string): SectionItem {
  const n = columnCount(layout);
  const data: Data = { ...s.data, layout };
  const extra = COLUMN_FIELDS.slice(n).flatMap((c) => blocksOf(s, c));
  if (extra.length) {
    const last = COLUMN_FIELDS[n - 1];
    data[last] = [...blocksOf(s, last), ...extra];
    for (const c of COLUMN_FIELDS.slice(n)) data[c] = [];
  }
  return { ...s, data };
}
