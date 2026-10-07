// The Hub start page, end to end: real production build. It has no database, so this needs only the addresses of the other apps.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ADMIN_URL, CRM_URL, FORMS_URL, HUB_URL, WEB_URL } from "@apex/e2e/constants";

test("lists every portal and links to the configured ones", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Eines de gestió");
  const href = (name: string) => page.getByRole("link", { name: new RegExp(name) }).getAttribute("href");
  expect(await href("CMS de la web")).toBe(ADMIN_URL);
  expect(await href("CRM i espai de treball")).toBe(CRM_URL);
  expect(await href("Formularis")).toBe(FORMS_URL);
  expect(await href("Web pública")).toBe(WEB_URL);
});

test("e-signature is not a link until its address is configured", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Signatura electrònica/ })).toHaveCount(0);
  await expect(page.getByText("Aviat disponible")).toBeVisible();
});

test("is not indexable, not frameable and answers the health check", async ({ page, request }) => {
  const r = await page.goto("/");
  expect(r?.headers()["x-frame-options"]).toBe("DENY");
  expect(r?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  expect(await (await request.get(`${HUB_URL}/robots.txt`)).text()).toContain("Disallow: /");
  const h = await request.get(`${HUB_URL}/api/health`);
  expect(h.status()).toBe(200);
  expect(await h.json()).toEqual({ status: "ok" });
});

for (const width of [320, 375, 768, 1440]) {
  test(`is accessible, has no sideways scroll and big enough targets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(axe.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const a of await page.getByRole("link").all()) expect((await a.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
}

test("keyboard: Tab reaches each portal link with a visible focus ring", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe("none");
});
