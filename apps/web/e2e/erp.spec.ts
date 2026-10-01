import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, who: "admin" | "editor") {
  await page.goto("/admin/login");
  await page.getByLabel("Correu electrònic").fill(`${who}@e2e.test`);
  await page.getByLabel("Contrasenya").fill(who === "admin" ? process.env.E2E_ADMIN_PASSWORD! : process.env.E2E_EDITOR_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
}
const addForm = (page: Page) => page.locator("form", { has: page.getByRole("button", { name: "Afegeix", exact: true }) });

test("ERP registry is closed to editors", async ({ page }) => {
  await login(page, "editor");
  await expect(page.getByRole("link", { name: "Gestió" })).toHaveCount(0);
  for (const path of ["/admin/erp", "/admin/erp/entries", "/admin/erp/members"]) expect((await page.goto(path))?.status()).toBe(404);
  expect((await page.request.get("/admin/erp/export", { maxRedirects: 0 })).status()).toBe(404);
});

test("ERP registry: setup lists, an expense with a document, member fees in bulk, totals and the Sage CSV", async ({ page }) => {
  test.setTimeout(150_000); // many screens in one flow
  await login(page, "admin");

  // setup: supplier, expense category with its Sage account, cost center, fee tier, member
  await page.goto("/admin/erp/suppliers");
  await addForm(page).getByLabel("Nom").fill("Papereria Test SL");
  await addForm(page).getByLabel("NIF/CIF").fill("B12345678");
  await addForm(page).getByRole("button", { name: "Afegeix" }).click();
  await expect(page.getByRole("status")).toContainText("Desat");
  await expect(page.getByText("Papereria Test SL · B12345678")).toBeVisible();

  await page.goto("/admin/erp/categories");
  await addForm(page).getByLabel("Nom").fill("Material de formació");
  await addForm(page).getByLabel(/Compte de Sage/).fill("629000");
  await addForm(page).getByRole("button", { name: "Afegeix" }).click();
  await expect(page.getByText("Despesa · Material de formació (629000)")).toBeVisible();

  await page.goto("/admin/erp/cost-centers");
  await addForm(page).getByLabel("Tipus").selectOption("course");
  await addForm(page).getByLabel("Nom").fill("Curs Packaging 2026");
  await addForm(page).getByLabel(/Pressupost/).fill("1.500,00");
  await addForm(page).getByRole("button", { name: "Afegeix" }).click();
  await expect(page.getByText("Curs · Curs Packaging 2026")).toBeVisible();

  await page.goto("/admin/erp/fee-tiers");
  await addForm(page).getByLabel("Nom del tram").fill("Tram A");
  await addForm(page).getByLabel("Quota anual (€)").fill("400,00");
  await addForm(page).getByRole("button", { name: "Afegeix" }).click();
  await expect(page.getByText("Tram A", { exact: true }).first()).toBeVisible();

  await page.goto("/admin/erp/members");
  await addForm(page).getByLabel("Empresa / nom").fill("Gràfiques Exemple SA");
  await addForm(page).getByLabel("Tram de quota").selectOption({ label: "Tram A" });
  await addForm(page).getByRole("button", { name: "Afegeix" }).click();
  await expect(page.getByText("Gràfiques Exemple SA")).toBeVisible();

  // an expense with a document attached
  await page.goto("/admin/erp/entries/new?kind=expense");
  await page.getByLabel("Descripció").fill("Paper per al curs");
  await page.locator("select[name=supplierId]").selectOption({ label: "Papereria Test SL" });
  await page.locator("select[name=categoryId]").selectOption({ label: "Material de formació" });
  await page.getByLabel(/Centre de cost/).selectOption({ label: "Curs Packaging 2026" });
  await page.getByLabel(/^Base/).fill("100,00");
  await page.getByLabel(/Nº de factura/).fill("F-2026-17");
  await page.getByLabel(/^Document/).setInputFiles({ name: "factura.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 factura-erp-e2e") });
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Desat");
  await expect(page).toHaveURL(/\/admin\/erp\/entries\/[0-9a-f-]{36}/);
  const dl = await page.request.get(new URL(page.url()).pathname + "/file", { maxRedirects: 0 });
  expect(dl.status()).toBe(302);
  expect(await (await fetch(dl.headers().location)).text()).toContain("factura-erp-e2e");
  await page.getByRole("button", { name: "Marca com a pagat" }).click();
  await expect(page.getByRole("status")).toContainText("Desat");

  // a bad amount is refused with a message
  await page.goto("/admin/erp/entries/new?kind=expense");
  await page.getByLabel("Descripció").fill("Malament");
  await page.getByLabel(/^Base/).fill("12,345");
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.locator(".msg.err")).toContainText("Import no vàlid");

  // member fees in bulk: preview, generate, no duplicates
  await page.goto("/admin/erp/fees?period=2026");
  await expect(page.getByText("1 quotes per generar")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Genera les quotes" }).click();
  await expect(page.getByText("1 quotes creades")).toBeVisible();
  await expect(page.getByText("0 quotes per generar")).toBeVisible();

  // lists, totals and export
  await page.goto("/admin/erp/entries?kind=income");
  await expect(page.getByText("Quota de soci 2026")).toBeVisible();
  await page.goto("/admin/erp/entries?kind=expense&q=paper");
  await expect(page.getByText("Paper per al curs")).toBeVisible();
  const csv = await page.request.get("/admin/erp/export?kind=expense");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const text = await csv.text();
  expect(text).toContain("Paper per al curs");
  expect(text).toContain("629000");
  expect(text).toContain("B12345678");
  await page.goto("/admin/erp");
  await expect(page.getByRole("heading", { name: /Resum/ })).toBeVisible();
  await expect(page.getByText("Curs Packaging 2026")).toBeVisible();
});
