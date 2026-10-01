import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Correu electrònic").fill("admin@e2e.test");
  await page.getByLabel("Contrasenya").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
}

test("workspace: create in the side panel, edit cells in place, open the record", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 800 });
  await login(page);
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/workspace\/[a-z-]+$/);
  await page.goto("/workspace/suppliers");
  await page.getByRole("link", { name: "+ Nou" }).click();
  await page.getByRole("complementary", { name: "Fitxa" }).getByLabel("Nom").fill("Workspace Test SL");
  await page.getByRole("button", { name: "Crea" }).click();
  await expect(page).toHaveURL(/open=[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: "Workspace Test SL" })).toBeVisible();

  // edit a cell in place: it saves on blur, and survives a reload
  const phone = page.getByLabel(/^Telèfon · Workspace Test SL/);
  await phone.fill("93 123 45 67");
  await phone.blur();
  await expect(page.locator(".ws-ok").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/^Telèfon · Workspace Test SL/)).toHaveValue("93 123 45 67");

  // a bad value is refused and says why
  const email = page.getByLabel(/^Correu · Workspace Test SL/);
  await email.fill("no-es-un-correu");
  await email.blur();
  await expect(page.getByRole("alert").filter({ hasText: "correu no vàlid" })).toBeVisible();

  // the side panel shows the history of the in-place edit and takes a note
  await expect(page.getByRole("region", { name: "Historial" })).toContainText("Telèfon");
  await page.getByLabel("Nova nota").fill("Nota des de l'espai de treball");
  await page.getByRole("button", { name: "Afegeix la nota" }).click();
  await expect(page.getByRole("region", { name: "Notes" })).toContainText("Nota des de l'espai de treball");
  await expect(page).toHaveURL(/\/workspace\/suppliers\?.*open=/); // stayed in the workspace
  await page.screenshot({ path: "test-results/workspace-suppliers.png" });
});

test("workspace is closed to editors", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Correu electrònic").fill("editor@e2e.test");
  await page.getByLabel("Contrasenya").fill(process.env.E2E_EDITOR_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
  expect((await page.goto("/workspace/suppliers"))?.status()).toBe(404);
  expect((await page.goto("/workspace"))?.status()).toBe(404);
});
