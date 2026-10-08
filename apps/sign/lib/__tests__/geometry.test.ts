import { describe, expect, it } from "vitest";
import { DEFAULT_SIZE, inBounds, num, parseBox, placeAt } from "@apex/sign/geometry";

describe("field geometry", () => {
  it("accepts boxes inside the page and refuses the rest", () => {
    expect(inBounds({ x: 0, y: 0, w: 100, h: 100 })).toBe(true);
    expect(inBounds({ x: 70, y: 92, w: 30, h: 8 })).toBe(true);
    expect(inBounds({ x: 70.5, y: 10, w: 30, h: 8 })).toBe(false); // sticks out on the right
    expect(inBounds({ x: 10, y: 95, w: 10, h: 6 })).toBe(false);   // sticks out at the bottom
    expect(inBounds({ x: -1, y: 0, w: 10, h: 10 })).toBe(false);
    expect(inBounds({ x: 0, y: 0, w: 0, h: 10 })).toBe(false);     // no empty boxes
    expect(inBounds({ x: NaN, y: 0, w: 10, h: 10 })).toBe(false);
    expect(inBounds({ x: 0, y: 0, w: Infinity, h: 10 })).toBe(false);
  });

  it("centres the default box on a click and keeps it inside the page", () => {
    const sig = DEFAULT_SIZE.signature;
    expect(placeAt("signature", 50, 50)).toEqual({ x: 50 - sig.w / 2, y: 50 - sig.h / 2, ...sig });
    for (const [cx, cy] of [[0, 0], [100, 100], [-20, 130], [99.9, 0.1]]) expect(inBounds(placeAt("signature", cx, cy))).toBe(true);
    expect(placeAt("signature", 100, 100)).toMatchObject({ x: 100 - sig.w, y: 100 - sig.h });
  });

  it("reads a box from form text, with a comma as decimal mark, and refuses anything unusable", () => {
    expect(parseBox({ x: "10,5", y: " 20 ", w: "30", h: "8" })).toEqual({ x: 10.5, y: 20, w: 30, h: 8 });
    expect(parseBox({ x: "10", y: "20", w: "30" })).toBeNull();           // a value is missing
    expect(parseBox({ x: "abc", y: "20", w: "30", h: "8" })).toBeNull();
    expect(parseBox({ x: "80", y: "20", w: "30", h: "8" })).toBeNull();   // outside the page
    expect(parseBox({ x: "10.12345", y: "0", w: "10", h: "10" })?.x).toBe(10.123); // three decimals, like the column
  });

  it("reads numeric columns, which come back from the database as strings", () => {
    expect(num("12.500")).toBe(12.5);
    expect(num(null)).toBeNaN();
    expect(num("")).toBeNaN();
  });
});
