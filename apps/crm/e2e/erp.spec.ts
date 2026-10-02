import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, who: "admin" | "editor") {
  await page.goto("/admin/login");
  await page.getByLabel("Correu electrònic").fill(`${who}@e2e.test`);
  await page.getByLabel("Contrasenya").fill(who === "admin" ? process.env.E2E_ADMIN_PASSWORD! : process.env.E2E_EDITOR_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
}
const sheet = (page: Page) => page.getByRole("complementary", { name: "Fitxa" });
/** Opens a workspace list in "new record" mode, fills the fields (label -> value) in the side sheet and saves; the new record opens. */
async function create(page: Page, list: string, fields: Record<string, string>, selects: Record<string, string | { label: string }> = {}) {
  await page.goto(`/workspace/${list}?new=1`);
  for (const [label, value] of Object.entries(fields)) await sheet(page).getByLabel(label, { exact: label === "Nom" }).fill(value);
  for (const [label, value] of Object.entries(selects)) await sheet(page).getByLabel(label).selectOption(value);
  await sheet(page).getByRole("button", { name: "Crea" }).click();
  await expect(page).toHaveURL(/open=[0-9a-f-]{36}/);
}

test("ERP registry is closed to editors", async ({ page }) => {
  await login(page, "editor");
  await expect(page.getByRole("link", { name: "Gestió" })).toHaveCount(0);
  for (const path of ["/admin/erp", "/admin/erp/entries", "/admin/erp/members"]) expect((await page.goto(path))?.status()).toBe(404);
  expect((await page.request.get("/admin/erp/export", { maxRedirects: 0 })).status()).toBe(404);
});

test("ERP registry: setup lists, an expense with a document, member fees in bulk, totals and the Sage CSV", async ({ page }) => {
  test.setTimeout(150_000); // many screens in one flow
  await login(page, "admin");

  // setup: supplier, expense category with its Sage account, cost center, fee tier, member (the lists live in the workspace)
  await create(page, "suppliers", { Nom: "Papereria Test SL", "NIF/CIF": "B12345678" });
  await expect(page.getByRole("heading", { name: "Papereria Test SL" })).toBeVisible();
  await create(page, "categories", { Nom: "Material de formació", "Compte de Sage": "629000" });
  await expect(page.getByRole("heading", { name: /Material de formació \(629000\)/ })).toBeVisible();
  await create(page, "cost-centers", { Nom: "Curs Packaging 2026", Pressupost: "1.500,00" }, { Tipus: "course" });
  await expect(page.getByRole("heading", { name: /Curs Packaging 2026/ })).toBeVisible();
  await create(page, "fee-tiers", { "Nom del tram": "Tram A", "Quota anual (€)": "400,00" });
  await expect(page.getByRole("heading", { name: /Tram A/ })).toBeVisible();
  await create(page, "members", { "Empresa / nom": "Gràfiques Exemple SA" }, { "Tram de quota": { label: "Tram A" } });
  await expect(page.getByRole("heading", { name: /Gràfiques Exemple SA/ })).toBeVisible();

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

test("engine lists: filter, sort and CSV export", async ({ page }) => {
  await login(page, "admin");
  await create(page, "categories", { Nom: "Quotes socis" }, { Tipus: "income" });
  await create(page, "categories", { Nom: "Paper oficina" }, { Tipus: "expense" });
  await page.goto("/workspace/categories?f_kind=expense");
  await expect(page.locator("select[name=f_kind]")).toHaveValue("expense");
  await expect(page.getByLabel(/^Nom · Despesa · Paper oficina/)).toBeVisible();
  await expect(page.getByLabel(/^Nom · Ingrés · Quotes socis/)).toHaveCount(0);
  await page.locator("select[name=f_kind]").selectOption("income"); // the filter applies by itself
  await expect(page).toHaveURL(/f_kind=income/);
  const res = await page.request.get("/workspace/categories/export?f_kind=income");
  expect(res.headers()["content-type"]).toContain("text/csv");
  const csv = await res.text();
  expect(csv).toContain("Quotes socis");
  expect(csv).not.toContain("Paper oficina");
});

test("the old admin list addresses land in the workspace", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/erp/suppliers");
  await expect(page).toHaveURL(/\/workspace\/suppliers$/);
  await page.goto("/admin/clients?q=zz");
  await expect(page).toHaveURL(/\/workspace\/companies\?q=zz/);
  await create(page, "suppliers", { Nom: "Redirigit SL" });
  const id = new URL(page.url()).searchParams.get("open")!;
  await page.goto(`/admin/erp/suppliers/${id}`);
  await expect(page).toHaveURL(new RegExp(`/workspace/suppliers\\?open=${id}`));
});

test("record sheet: notes, file, history and archive", async ({ page }) => {
  await login(page, "admin");
  await create(page, "suppliers", { Nom: "Fitxa Test SL" });
  await expect(page.getByRole("heading", { name: "Fitxa Test SL" })).toBeVisible();

  await sheet(page).getByRole("link", { name: "Notes" }).click();
  await page.getByLabel("Nova nota").fill("Trucada amb el gerent");
  await page.getByRole("button", { name: "Afegeix la nota" }).click();
  await expect(page.getByRole("region", { name: "Notes" })).toContainText("Trucada amb el gerent");

  await sheet(page).getByRole("link", { name: "Resum" }).click();
  await sheet(page).getByText(/Mostra \d+ camps? buits?/).click(); // empty fields are folded away
  await sheet(page).getByLabel("Telèfon").fill("93 123 45 67");
  await page.getByRole("region", { name: "Dades" }).getByRole("button", { name: "Desa" }).click();
  await sheet(page).getByRole("link", { name: "Historial" }).click();
  await expect(page.getByRole("region", { name: "Historial" })).toContainText("Telèfon: — → 93 123 45 67");

  await sheet(page).getByRole("link", { name: "Fitxers" }).click();
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
  await page.locator("input[type=file]").setInputFiles({ name: "contracte.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.locator("button", { hasText: "Puja" }).click();
  await expect(page.getByRole("region", { name: "Fitxers" })).toContainText("contracte.pdf");

  await sheet(page).getByRole("link", { name: "Resum" }).click();
  await page.getByRole("button", { name: "Arxiva" }).click();
  await expect(page).toHaveURL(/\/workspace\/suppliers\?/);
  await page.goto("/workspace/suppliers?q=Fitxa Test");
  await expect(page.getByLabel(/^Nom · Fitxa Test SL/)).toHaveCount(0);
  await page.goto("/workspace/suppliers?q=Fitxa Test&archived=1");
  await expect(page.getByLabel(/^Nom · Fitxa Test SL/)).toBeVisible();
});

test("subscriptions: the renewal button is on the record sheet", async ({ page }) => {
  await login(page, "admin");
  await create(page, "subscriptions", { Nom: "Programari e2e", "Import (€)": "120,00", "Propera renovació": "2026-12-01" });
  await expect(sheet(page).getByRole("button", { name: "Registra la renovació" })).toBeVisible();
  await sheet(page).getByRole("button", { name: "Registra la renovació" }).click();
  await expect(page).toHaveURL(/\/admin\/erp\/entries\?kind=expense&saved=renewal/);
  await expect(page.getByText("Programari e2e").first()).toBeVisible();
});
