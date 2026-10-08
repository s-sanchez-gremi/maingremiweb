import { expect, test } from "@playwright/test";

test("public basics: language redirect, localized 404, robots", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/ca$/);
  const res = await page.goto("/ca/no-existeix");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Pàgina no trobada" })).toBeVisible();
  await page.goto("/es/no-existe");
  await expect(page.getByRole("heading", { name: "Página no encontrada" })).toBeVisible();
  expect(await (await page.request.get("/robots.txt")).text()).toContain("Disallow: /admin");
});
