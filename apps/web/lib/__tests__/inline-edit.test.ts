import { describe, expect, it } from "vitest";
import { setPath } from "../inline-edit";

// The element → markdown part needs a real browser; it is covered by e2e/builder.spec.ts.
describe("in-place editing", () => {
  it("sets nested fields without touching the rest", () => {
    const d = { heading: "A", cards: [{ title: "x", text: "t" }, { title: "y" }] };
    const n = setPath(d, "cards.1.title", "z");
    expect(n).toEqual({ heading: "A", cards: [{ title: "x", text: "t" }, { title: "z" }] });
    expect(d.cards[1].title).toBe("y");
    expect(setPath(d, "cards.9.title", "z")).toBe(d); // out of range: unchanged
    expect(setPath(d, "heading", "B").heading).toBe("B");
  });
});
