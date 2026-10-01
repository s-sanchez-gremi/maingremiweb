import { describe, expect, it } from "vitest";
import { formatEuros, parseEuros, plainEuros, vatOf, withVat } from "../money";

describe("parseEuros()", () => {
  it.each([["12", 1200], ["12,5", 1250], ["12.50", 1250], ["1.234,56", 123456], ["1,234.56", 123456], ["1234,56", 123456], [" 0,05 € ", 5], ["-3,40", -340], ["0", 0]])("%s -> %s", (s, c) => expect(parseEuros(s)).toBe(c));
  it.each(["", "abc", "1,2,3", "12,345", "1..2", "1.23.4", "--1", "€"])("rejects %j", (s) => expect(parseEuros(s)).toBeNull());
});
describe("VAT", () => {
  it("rounds half up on the base", () => {
    expect(vatOf(1000, 2100)).toBe(210);
    expect(vatOf(1005, 2100)).toBe(211);   // 211.05 -> 211
    expect(vatOf(1002, 1000)).toBe(100);   // 100.2 -> 100
    expect(vatOf(5, 1000)).toBe(1);        // 0.5 -> 1 (half up)
    expect(vatOf(-1005, 2100)).toBe(-211); // symmetric for refunds
    expect(vatOf(12345, 0)).toBe(0);
  });
  it("total = base + vat, always", () => { for (const b of [1, 99, 1001, 123456]) for (const r of [0, 400, 1000, 2100]) { const x = withVat(b, r); expect(x.total).toBe(x.base + x.vat); } });
});
describe("formatting", () => {
  it("plain keeps cents and the comma", () => { expect(plainEuros(123456)).toBe("1234,56"); expect(plainEuros(5)).toBe("0,05"); expect(plainEuros(-340)).toBe("-3,40"); });
  it("currency format", () => expect(formatEuros(123456)).toMatch(/1\.234,56/));
});
