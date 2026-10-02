import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, readColorTokens } from "../contrast";

const t = readColorTokens(readFileSync(join(process.cwd(), "../../packages/ui/src/tokens.css"), "utf8"));

// Every text/background pairing the site actually uses. AA: 4.5 for normal text, 3 for large text and UI outlines.
const text: [string, string, string][] = [
  ["ink", "bg", "body text"], ["ink", "surface", "text on cards"], ["ink", "bg2", "text on beige band"],
  ["text2", "bg", "quiet text"], ["text2", "surface", "quiet text on cards"], ["text2", "bg2", "quiet text on beige band"],
  ["accent", "bg", "eyebrows, links"], ["accent", "surface", "eyebrows on cards"], ["accent", "bg2", "eyebrows on beige band"],
  ["bg", "accent", "primary button"], ["surface", "accent", "menu on the red header"], ["ink", "surface", "white button on the red header"], ["bg", "accent-hover", "primary button hover"],
  ["ink-text", "ink", "text on dark band"], ["ink-text", "ink2", "text on hero"], ["bg", "ink", "headings on dark"], ["bg", "ink2", "headings on hero"],
  ["danger", "surface", "error text"], ["danger", "danger-bg", "error banner"], ["ok", "ok-bg", "success banner"],
];
const ui: [string, string, string][] = [
  ["field-border", "bg", "input outline on ivory"], ["field-border", "surface", "input outline on white"], ["field-border", "bg2", "input outline on beige"],
];

describe("design tokens meet WCAG AA", () => {
  it.each(text)("%s on %s (%s) >= 4.5:1", (fg, bg) => expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5));
  it.each(ui)("%s on %s (%s) >= 3:1", (fg, bg) => expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(3));
  it("the light greys that fail as text are not used as text tokens", () => {
    // --line is decorative only; if it ever becomes text it must pass 4.5
    expect(contrast(t.line, t.bg)).toBeLessThan(4.5);
    expect(t["text2"]).toBe("#4D4741");
  });
  it("accent on the dark panels is NOT allowed for small text (documented: use ivory there)", () => {
    expect(contrast(t.accent, t.ink)).toBeLessThan(4.5);
  });
});
