// Draft preview for the visual editor. Drafts may be incomplete (a block just added has no text yet), so instead of
// rejecting the whole page like publish() does, each invalid section or block is swapped for a visible placeholder
// that keeps its id: the editor can still select it, and the public site never sees placeholders (publish validates).
import { sectionByName, sectionSchema, type Section } from "@/sections/registry";
import { blockByName, blockDefs, COLUMN_FIELDS } from "@/sections/blocks";
import { blockSchemaFor } from "@apex/core/fields";

type Raw = { id?: unknown; type?: unknown; data?: unknown; style?: unknown };
const placeholder = (what: string, label: string) => `**✎ ${what} per completar: ${label}.** Omple'l al panell de la dreta.`;

export function lenientSections(raw: unknown): Section[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 60).map((r: Raw, i) => {
    const id = typeof r?.id === "string" && r.id ? r.id : `s${i}`;
    const type = typeof r?.type === "string" ? r.type : "";
    const data = { ...((r?.data as Record<string, unknown>) ?? {}) };
    // Empty title/text blocks stay as they are (rendered empty and editable in place); they are put back after the
    // section passed validation with a stand-in.
    const keep = new Map<string, unknown>();
    if (type === "columns") {
      for (const c of COLUMN_FIELDS) {
        const list = Array.isArray(data[c]) ? (data[c] as Raw[]) : [];
        data[c] = list.map((b, j) => {
          const ok = blockSchemaFor(blockDefs).safeParse(b);
          if (ok.success) return ok.data;
          if ((b?.type === "heading" || b?.type === "text") && typeof b.id === "string" && b.id) {
            keep.set(b.id, { id: b.id, type: b.type, data: { ...((b.data as Record<string, unknown>) ?? {}) } });
            return { id: b.id, type: "text", data: { body: "-" } };
          }
          const label = blockByName[String(b?.type)]?.label ?? "bloc";
          return { id: typeof b?.id === "string" ? b.id : `${id}-${c}-${j}`, type: "text", data: { body: placeholder("Bloc", label) } };
        });
      }
    }
    const ok = sectionSchema.safeParse({ id, type, data, style: r?.style ?? undefined });
    if (ok.success) {
      if (keep.size) for (const c of COLUMN_FIELDS) {
        const d = ok.data.data as Record<string, unknown>;
        if (Array.isArray(d[c])) d[c] = (d[c] as { id: string }[]).map((b) => (keep.get(b.id) as typeof b) ?? b);
      }
      return ok.data;
    }
    const label = sectionByName[type]?.label ?? "secció";
    return sectionSchema.parse({ id, type: "text", data: { body: placeholder("Secció", label) } });
  });
}
