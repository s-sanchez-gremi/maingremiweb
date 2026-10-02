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
  await page.getByRole("link", { name: "Nou", exact: true }).click();
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

test("workspace: editors get the CRM databases, not the ERP ones", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Correu electrònic").fill("editor@e2e.test");
  await page.getByLabel("Contrasenya").fill(process.env.E2E_EDITOR_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
  expect((await page.goto("/workspace/suppliers"))?.status()).toBe(404);
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/workspace\/companies$/);
  await expect(page.getByRole("link", { name: "Proveïdors" })).toHaveCount(0);
});

test("workspace: companies (one per tax id), people linked to a company", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 800 });
  await login(page);
  await page.goto("/workspace/companies");
  const panel = page.getByRole("complementary", { name: "Fitxa" });
  const create = async (name: string, taxId: string) => {
    await page.goto("/workspace/companies?new=1");
    await panel.getByLabel("Nom", { exact: true }).fill(name);
    await panel.getByLabel("NIF/CIF").fill(taxId);
    await panel.getByRole("button", { name: "Crea" }).click();
  };
  await create("Gràfiques Vila SL", "B99887766");
  await expect(page).toHaveURL(/open=/);
  await expect(page.getByRole("heading", { name: "Gràfiques Vila SL" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Projectes i accés al portal/ })).toBeVisible();

  await create("Duplicada SL", "b 99887766");
  await expect(page.getByRole("alert").filter({ hasText: "Ja existeix" })).toBeVisible();

  await page.goto("/workspace/people?new=1");
  await panel.getByLabel("Nom", { exact: true }).fill("Anna Puig");
  await panel.getByLabel("Empresa").selectOption({ label: "Gràfiques Vila SL" });
  await panel.getByRole("button", { name: "Crea" }).click();
  await expect(page.getByRole("heading", { name: "Anna Puig" })).toBeVisible();

  await page.goto("/workspace/companies");
  await page.getByRole("link", { name: "Obre Gràfiques Vila SL · B99887766" }).click();
  await expect(page.getByRole("region", { name: "Registres enllaçats" })).toContainText("Anna Puig");
});

test("workspace: an event, who attends it, a sponsor and a visit", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 800 });
  await login(page);
  const panel = page.getByRole("complementary", { name: "Fitxa" });

  await page.goto("/workspace/events?new=1");
  await panel.getByLabel("Nom", { exact: true }).fill("Gala e2e 2026");
  await panel.getByLabel("Data", { exact: true }).fill("2026-11-20");
  await panel.getByLabel("Tipus").selectOption("gala");
  await panel.getByRole("button", { name: "Crea" }).click();
  await expect(page.getByRole("heading", { name: "Gala e2e 2026" })).toBeVisible();

  await page.goto("/workspace/people?new=1");
  await panel.getByLabel("Nom", { exact: true }).fill("Convidada e2e");
  await panel.getByRole("button", { name: "Crea" }).click();
  await expect(page.getByRole("heading", { name: "Convidada e2e" })).toBeVisible();

  await page.goto("/workspace/attendance?new=1");
  await panel.getByLabel("Esdeveniment").selectOption({ label: "Gala e2e 2026" });
  await panel.getByLabel("Persona").selectOption({ label: "Convidada e2e" });
  await panel.getByLabel("Estat").selectOption("confirmed");
  await panel.getByRole("button", { name: "Crea" }).click();
  await expect(page).toHaveURL(/\/workspace\/attendance/);

  await page.goto("/workspace/events");
  await page.getByRole("link", { name: /^Obre Gala e2e 2026/ }).click();
  await expect(page.getByRole("region", { name: "Registres enllaçats" })).toContainText("Convidada e2e");
  await expect(page.getByRole("region", { name: "Registres enllaçats" })).toContainText("Confirmat");

  await page.goto("/workspace/sponsors?new=1");
  await panel.getByLabel("Nom", { exact: true }).fill("Patrocini e2e");
  await panel.getByLabel("Nivell").selectOption("gold");
  await panel.getByLabel("Import (€)").fill("5.000,50");
  await panel.getByRole("button", { name: "Crea" }).click();
  await expect(page.getByRole("heading", { name: "Patrocini e2e" })).toBeVisible();
  await expect(page.getByLabel(/^Import \(€\) · Patrocini e2e/)).toHaveValue("5000,50");

  await page.goto("/workspace/visits?new=1");
  await panel.getByLabel("Assumpte").fill("Visita e2e");
  await panel.getByRole("button", { name: "Crea" }).click();
  await expect(page.getByRole("heading", { name: "Visita e2e" })).toBeVisible();
});

test("workspace: CSV import (validate first), export, and search across databases", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 800 });
  await login(page);
  await page.goto("/workspace/companies/import");
  await expect(page.getByRole("heading", { name: "Importa empreses" })).toBeVisible();

  const csv = (rows: string[]) => Buffer.from(["Nom;Estat;NIF/CIF;Població", ...rows].join("\r\n"));
  const good = ["Importada Alfa SL;Agremiada;B70000001;Terrassa", "Importada Beta SL;No agremiada;B70000002;Girona"];

  // a file with one bad row: validation says so and nothing is saved
  await page.locator('input[type=file]').setInputFiles({ name: "empreses.csv", mimeType: "text/csv", buffer: csv([...good, "Mala SL;Inventada;B70000003;Lleida"]) });
  await page.getByRole("button", { name: "Continua" }).click();
  const result = page.getByRole("region", { name: "Resultat" });
  await expect(result).toContainText("1 amb errors");
  await expect(result).toContainText("Fila 4");

  // fixed file: validate, then import for real
  await page.locator('input[type=file]').setInputFiles({ name: "empreses.csv", mimeType: "text/csv", buffer: csv(good) });
  await page.getByRole("button", { name: "Continua" }).click();
  await expect(result).toContainText("Tot correcte");
  await page.getByLabel("Només validar").uncheck();
  await page.locator('input[type=file]').setInputFiles({ name: "empreses.csv", mimeType: "text/csv", buffer: csv(good) });
  await page.getByRole("button", { name: "Continua" }).click();
  await expect(result).toContainText("Importació feta");

  // they are in the list (and the bad file left nothing behind); the export has them
  await page.goto("/workspace/companies?q=Importada");
  await expect(page.getByLabel(/^Nom · Importada Alfa SL/)).toBeVisible();
  await expect(page.getByText("Mala SL")).toHaveCount(0);
  const csvOut = await (await page.request.get("/workspace/companies/export?q=Importada")).text();
  expect(csvOut).toContain("Importada Beta SL");

  // one search over every database
  await page.goto("/workspace/search?q=importada alfa");
  await expect(page.getByRole("region", { name: "Empreses" })).toContainText("Importada Alfa SL");
  await page.getByRole("searchbox", { name: /Cerca a tot/ }).fill("importada");
  await page.getByRole("searchbox", { name: /Cerca a tot/ }).press("Enter");
  await expect(page).toHaveURL(/\/workspace\/search\?q=importada/);

  // the template has the headers
  const tpl = await (await page.request.get("/workspace/companies/import/template")).text();
  expect(tpl).toContain("NIF/CIF");
});
