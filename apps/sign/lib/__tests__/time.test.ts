import { describe, expect, it } from "vitest";
import { dayInMadrid, endOfDayMadrid } from "@apex/sign/time";

describe("expiry days in Catalonia's time", () => {
  it("means the end of that day in Madrid, in summer and in winter", () => {
    expect(endOfDayMadrid("2026-07-15")!.toISOString()).toBe("2026-07-15T21:59:59.000Z");  // UTC+2
    expect(endOfDayMadrid("2026-12-15")!.toISOString()).toBe("2026-12-15T22:59:59.000Z");  // UTC+1
  });

  it("is right on the days the clocks change", () => {
    expect(endOfDayMadrid("2026-03-29")!.toISOString()).toBe("2026-03-29T21:59:59.000Z");  // spring forward: the day ends in summer time
    expect(endOfDayMadrid("2026-10-25")!.toISOString()).toBe("2026-10-25T22:59:59.000Z");  // fall back: the day ends in winter time
  });

  it("refuses text that is not a real day", () => {
    for (const bad of ["", "abc", "2026-02-30", "2026-13-01", "2026-1-1", "2026-10-21T10:00", "21/10/2026"]) expect(endOfDayMadrid(bad)).toBeNull();
    expect(endOfDayMadrid("2028-02-29")).not.toBeNull(); // a leap day is real
    expect(endOfDayMadrid("2027-02-29")).toBeNull();
  });

  it("tells which calendar day an instant is in Madrid", () => {
    expect(dayInMadrid(new Date("2026-10-21T22:30:00Z"))).toBe("2026-10-22");  // 00:30 the next day
    expect(dayInMadrid(new Date("2026-10-21T21:59:59Z"))).toBe("2026-10-21");
    expect(dayInMadrid(endOfDayMadrid("2026-10-21")!)).toBe("2026-10-21");     // round trip
  });
});
