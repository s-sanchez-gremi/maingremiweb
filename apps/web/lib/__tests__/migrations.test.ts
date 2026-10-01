import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Two people adding "the next migration" on different branches both pick the same number. Catch it before it reaches main.
describe("migration files", () => {
  const files = readdirSync(join(__dirname, "../../../../db/migrations")).filter((f) => f.endsWith(".sql")).sort();
  it("are named NNNN_name.sql", () => { for (const f of files) expect(f).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/); });
  it("have unique numbers with no gaps, starting at 0001", () => {
    const nums = files.map((f) => Number(f.slice(0, 4)));
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });
});
