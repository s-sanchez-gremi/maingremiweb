import { describe, expect, it } from "vitest";
import { addBlock, addSection, duplicate, findBlock, moveBlock, moveSection, nudge, removeBlock, setLayout, type SectionItem } from "../builder-ops";
import { sectionsSchema } from "@/sections/registry";

const page = (): SectionItem[] => [
  { id: "A", type: "text", data: { body: "a" } },
  { id: "C", type: "columns", data: { heading: "", layout: "1-1", c1: [{ id: "b1", type: "text", data: { body: "1" } }, { id: "b2", type: "text", data: { body: "2" } }], c2: [], c3: [], c4: [] } },
  { id: "B", type: "text", data: { body: "b" } },
];
const ids = (s: SectionItem[]) => s.map((x) => x.id);
const col = (s: SectionItem[], c: string) => ((s.find((x) => x.id === "C")!.data[c] as { id: string }[]) ?? []).map((b) => b.id);

describe("visual builder operations", () => {
  it("moves sections to a drop position measured before the move", () => {
    expect(ids(moveSection(page(), "A", 3))).toEqual(["C", "B", "A"]);
    expect(ids(moveSection(page(), "B", 0))).toEqual(["B", "A", "C"]);
    expect(ids(nudge(page(), "A", 1))).toEqual(["C", "A", "B"]);
    expect(ids(nudge(page(), "A", -1))).toEqual(["A", "C", "B"]);
  });
  it("moves blocks within and between columns", () => {
    expect(col(moveBlock(page(), "b1", { section: "C", col: "c1", index: 2 }), "c1")).toEqual(["b2", "b1"]);
    const p = moveBlock(page(), "b1", { section: "C", col: "c2", index: 0 });
    expect([col(p, "c1"), col(p, "c2")]).toEqual([["b2"], ["b1"]]);
    expect(col(nudge(page(), "b2", -1), "c1")).toEqual(["b2", "b1"]);
  });
  it("a block dropped between sections gets its own one-column section; a new section dropped in a column lands after it", () => {
    const p = moveBlock(page(), "b2", { index: 0 });
    expect(p[0].type).toBe("columns");
    expect(p[0].data.layout).toBe("1");
    expect(findBlock(p, "b2")!.section.id).toBe(p[0].id);
    expect(ids(addSection(page(), "cta", { section: "C", col: "c1", index: 0 }))[2]).not.toBe("B");
    expect(addSection(page(), "cta", { section: "C", col: "c1", index: 0 })[2].type).toBe("cta");
  });
  it("new blocks are empty but keep the page's shape; removing and duplicating give fresh ids", () => {
    const p = addBlock(page(), "button", { section: "C", col: "c2", index: 0 });
    expect(findBlock(p, col(p, "c2")[0])!.block.data).toEqual({ label: "", url: "", variant: "primary", size: "m" });
    expect(col(removeBlock(page(), "b1"), "c1")).toEqual(["b2"]);
    const d = duplicate(page(), "C");
    expect(d).toHaveLength(4);
    expect(col([d[2]].map((s) => ({ ...s, id: "C" })), "c1")).not.toContain("b1");
  });
  it("fewer columns never loses blocks", () => {
    const s = { ...page()[1], data: { ...page()[1].data, layout: "1-1-1", c3: [{ id: "b3", type: "text", data: { body: "3" } }] } };
    const one = setLayout(s, "1");
    expect((one.data.c1 as { id: string }[]).map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
    expect(sectionsSchema.safeParse([one]).success).toBe(true);
  });
});
