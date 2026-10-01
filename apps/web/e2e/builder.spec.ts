// Visual page builder: library → live preview → inspector, drag and drop, brand styles, and the draft/live rule.
import { expect, test, type Page } from "@playwright/test";
import { slugify } from "../lib/slug";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Correu electrònic").fill("admin@e2e.test");
  await page.getByLabel("Contrasenya").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
}

test("the preview is staff-only and only our own editor may frame it", async ({ page }) => {
  const anon = await page.request.get("/admin/preview/00000000-0000-4000-8000-000000000000", { maxRedirects: 0 });
  expect(anon.status()).toBe(307);
  expect(anon.headers()["location"]).toContain("/admin/login");
  await login(page);
  const editor = await page.request.get("/admin/content?type=page");
  expect(editor.headers()["x-frame-options"]).toBe("DENY");
  expect(editor.headers()["content-security-policy"]).toContain("frame-src 'self'");
  const preview = await page.request.get("/admin/preview/00000000-0000-4000-8000-000000000000");
  expect(preview.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(preview.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
});

test("build a page visually: add, drag, edit, style, then publish", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page);
  await page.goto("/admin/content?type=page");
  await page.getByRole("button", { name: "Nova pàgina" }).click();
  const title = `Pàgina visual ${Date.now()}`;
  await page.getByLabel("Títol", { exact: true }).fill(title);
  await page.getByLabel("Slug (URL)").fill("");
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Desat." })).toBeVisible();
  const path = `/ca/${slugify(title)}`;

  const lib = page.getByRole("complementary", { name: "Biblioteca" });
  const inspect = page.getByRole("complementary", { name: "Propietats" });
  const preview = page.frameLocator("iframe[title='Vista prèvia de la pàgina']");
  const saved = page.getByText("Esborrany desat");

  // Click-to-add a heading: it gets its own one-column section and opens in the inspector.
  await lib.getByRole("button", { name: "Títol", exact: true }).click();
  await inspect.getByLabel("Títol *").fill("Benvinguts al GREMI");
  await expect(saved).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Benvinguts al GREMI" })).toBeVisible();

  // Drag a button from the library into the same column, below the heading.
  await lib.getByRole("button", { name: "Botó", exact: true }).dragTo(preview.locator("[data-col=c1]").first(), { targetPosition: { x: 20, y: 60 } });
  await expect(inspect.getByLabel("Text del botó *")).toBeVisible();
  await inspect.getByLabel("Text del botó *").fill("Fes-te sòcia");
  await inspect.getByLabel("Enllaç *").fill("/ca/blog");
  await expect(saved).toBeVisible();
  await expect(preview.getByRole("link", { name: "Fes-te sòcia" })).toBeVisible();

  // Pick the section in the preview and give it the brand red background.
  await inspect.getByRole("button", { name: "Secció ↑" }).click();
  await inspect.getByLabel("Fons").selectOption("red");
  await expect(saved).toBeVisible();
  await expect(preview.locator(".sx-bg-red")).toHaveCount(1);

  // Autosave touched only the draft: nothing is public until Publica.
  expect((await page.request.get(path)).status()).toBe(404);
  await page.getByRole("button", { name: "Publica", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Publicat" })).toBeVisible();
  const body = await (await page.request.get(path)).text();
  expect(body).toContain("Benvinguts al GREMI");
  expect(body).toContain("sx sx-bg-red");
  expect(body).toContain(">Fes-te sòcia<");
  expect(body).not.toContain("apex-sel"); // editor-only markup never reaches the public page
});
