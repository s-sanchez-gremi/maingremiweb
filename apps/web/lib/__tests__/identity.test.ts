import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APPS, appIconSvg, halftoneDots, type AppKey } from "@apex/ui/appmark";
import { contrast, readColorTokens } from "../contrast";

const root = join(process.cwd(), "../..");
const css = readFileSync(join(root, "packages/ui/src/tokens.css"), "utf8");
const t = readColorTokens(css);

describe("app identity (docs/identity-plan.md)", () => {
  it.each(Object.keys(APPS) as AppKey[])("%s: the mark's colours are the tokens and its text passes AA", (k) => {
    const a = APPS[k];
    expect(a.spot.toLowerCase()).toBe(t[`spot-${k}`].toLowerCase());
    expect(a.on.toLowerCase()).toBe((k === "forms" ? t["on-spot-forms"] : t["on-spot-light"]).toLowerCase());
    expect(contrast(a.on, a.spot)).toBeGreaterThanOrEqual(4.5); // letter and button text on the ink
  });
  it("every ink except yellow also works as text on paper and white (links, active menu)", () => {
    for (const k of Object.keys(APPS) as AppKey[]) {
      if (k === "forms") continue;
      expect(contrast(t[`spot-${k}`], t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t[`spot-${k}`], t.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("yellow is a fill only: it fails as text on light backgrounds, so ink text goes on it", () => {
    expect(contrast(t["spot-forms"], t.bg)).toBeLessThan(3);
    expect(contrast(t["on-spot-forms"], t["spot-forms"])).toBeGreaterThanOrEqual(7);
  });
  it("tokens.css selects an ink for every app and Forms switches to ink text", () => {
    for (const k of Object.keys(APPS)) expect(css).toContain(`[data-app="${k}"] { --spot: var(--spot-${k})`);
    expect(css).toMatch(/\[data-app="forms"\][^}]*--on-spot: var\(--on-spot-forms\)/);
  });
  it("the halftone fades out and stays inside its box", () => {
    const d = halftoneDots(7, 7, 1);
    expect(d.length).toBeGreaterThan(10);
    expect(d.every((x) => x.cx > 0 && x.cx < 100 && x.cy > 0 && x.cy < 100 && x.r > 0)).toBe(true);
    expect(d.length).toBeLessThan(49);
  });
  it.each([["admin"], ["crm"], ["forms"]] as [AppKey][])("%s: the committed icon.svg is what the generator makes", (k) => {
    expect(readFileSync(join(root, `apps/${k}/app/icon.svg`), "utf8")).toBe(appIconSvg(k));
  });
  it("every app that has an icon file is registered, so none is hand-edited unnoticed", () => {
    for (const k of Object.keys(APPS)) {
      const f = join(root, `apps/${k}/app/icon.svg`);
      if (existsSync(f)) expect(readFileSync(f, "utf8")).toBe(appIconSvg(k as AppKey));
    }
  });
});
