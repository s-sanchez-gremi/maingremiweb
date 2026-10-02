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

  // the side panel shows the history of the in-place edit (a tab of the sheet) and takes a note
  const sheet = page.getByRole("complementary", { name: "Fitxa" });
  await sheet.getByRole("link", { name: "Historial" }).click();
  await expect(page.getByRole("region", { name: "Historial" })).toContainText("Telèfon");
  await sheet.getByRole("link", { name: "Notes" }).click();
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
  await panel.getByRole("link", { name: /^Persones/ }).click();
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
  await panel.getByRole("link", { name: /^Assistència/ }).click();
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

test("workspace: board view groups by status, cards can be moved, statuses are coloured", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 800 });
  await login(page);
  await page.goto("/workspace/sponsors?new=1");
  const panel = page.getByRole("complementary", { name: "Fitxa" });
  await panel.getByLabel("Nom", { exact: true }).fill("Tauler e2e");
  await panel.getByRole("button", { name: "Crea" }).click();
  await expect(page.getByRole("heading", { name: "Tauler e2e" })).toBeVisible();

  await page.goto("/workspace/sponsors");
  await page.getByRole("link", { name: "Tauler", exact: true }).click();
  await expect(page).toHaveURL(/view=board/);
  const potential = page.getByRole("region", { name: /^Potencial:/ });
  await expect(potential.locator(".ws-card", { hasText: "Tauler e2e" })).toBeVisible();

  // the card menu (keyboard route; dragging calls the same code) moves it and it stays moved
  await potential.locator(".ws-card", { hasText: "Tauler e2e" }).getByRole("combobox").selectOption("active");
  const active = page.getByRole("region", { name: /^Actiu:/ });
  await expect(active.locator(".ws-card", { hasText: "Tauler e2e" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: /^Actiu:/ }).locator(".ws-card", { hasText: "Tauler e2e" })).toBeVisible();

  // in the table the same status wears its colour
  await page.goto("/workspace/sponsors?q=Tauler e2e");
  const tone = await page.getByLabel(/^Estat · Tauler e2e/).getAttribute("data-tone");
  expect(tone).toBe("good");
});

test("workspace: companies tabs with counts, grouping, columns, and bulk actions on selected rows", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 800 });
  await login(page);
  const panel = page.getByRole("complementary", { name: "Fitxa" });
  for (const [name, cif] of [["Massiva Alfa SL", "B80000001"], ["Massiva Beta SL", ""]]) {
    await page.goto("/workspace/companies?new=1");
    await panel.getByLabel("Nom", { exact: true }).fill(name);
    if (cif) await panel.getByLabel("NIF/CIF").fill(cif);
    await panel.getByRole("button", { name: "Crea" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  await page.goto("/workspace/events?new=1");
  await panel.getByLabel("Nom", { exact: true }).fill("Acte massiu e2e");
  await panel.getByRole("button", { name: "Crea" }).click();
  await expect(page.getByRole("heading", { name: "Acte massiu e2e" })).toBeVisible();

  // a tab with a count: only companies without a tax id
  await page.goto("/workspace/companies?q=Massiva");
  const tabs = page.getByRole("navigation", { name: "Vistes" });
  await expect(tabs.getByRole("link", { name: /^Sense CIF/ })).toBeVisible();
  await tabs.getByRole("link", { name: /^Sense CIF/ }).click();
  await expect(page).toHaveURL(/tab=no-taxid/);
  await expect(page.getByLabel(/^Nom · Massiva Beta SL/)).toBeVisible();
  await expect(page.getByLabel(/^Nom · Massiva Alfa SL/)).toHaveCount(0);

  // select both, invite them to the event, once only
  await page.goto("/workspace/companies?q=Massiva");
  await page.getByRole("checkbox", { name: /^Selecciona Massiva Alfa SL/ }).check();
  await page.getByRole("checkbox", { name: /^Selecciona Massiva Beta SL/ }).check();
  const bar = page.getByRole("region", { name: "Accions sobre la selecció" });
  await expect(bar).toContainText("2 seleccionades");
  await bar.getByLabel("Esdeveniment").selectOption({ label: "Acte massiu e2e" });
  await bar.getByRole("button", { name: "Convida" }).click();
  await expect(bar.getByRole("status")).toContainText("Convidades: 2");
  await page.getByRole("checkbox", { name: /^Selecciona Massiva Alfa SL/ }).check();
  await bar.getByRole("button", { name: "Convida" }).click();
  await expect(bar.getByRole("status")).toContainText("1 omeses");

  // change the status of the selection
  await page.getByRole("checkbox", { name: /^Selecciona Massiva Alfa SL/ }).check();
  await page.getByRole("checkbox", { name: /^Selecciona Massiva Beta SL/ }).check();
  await bar.getByLabel(/^Nou valor/).selectOption("member");
  await bar.getByRole("button", { name: "Aplica" }).click();
  await expect(bar.getByRole("status")).toContainText("Actualitzades: 2");
  await expect(page.getByLabel(/^Estat · Massiva Alfa SL/)).toHaveValue("member");

  // grouped by status, with the group header and its total; hidden columns come back through the menu
  await page.goto("/workspace/companies?q=Massiva&group=memberStatus");
  await expect(page.getByRole("button", { name: /Agremiada/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Núm. de client" })).toHaveCount(0);
  await page.getByText("Columnes", { exact: false }).first().click();
  await page.getByRole("checkbox", { name: "Núm. de client" }).click();
  await expect(page.getByRole("columnheader", { name: "Núm. de client" })).toBeVisible();

  // the selection goes to the CSV
  const id = await page.getByRole("checkbox", { name: /^Selecciona Massiva Alfa SL/ }).getAttribute("data-id");
  const csv = await (await page.request.get(`/workspace/companies/export?ids=${id}`)).text();
  expect(csv).toContain("Massiva Alfa SL");
  expect(csv).not.toContain("Massiva Beta SL");
});

test("workspace: chart view, filters on text fields, column presets, and a per-person tab", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 800 });
  await login(page);
  const panel = page.getByRole("complementary", { name: "Fitxa" });
  for (const name of ["Grafica Alfa SL", "Grafica Beta SL"]) {
    await page.goto("/workspace/companies?new=1");
    await panel.getByLabel("Nom", { exact: true }).fill(name);
    await panel.getByLabel("Província").fill("Zzprov");
    await panel.getByRole("button", { name: "Crea" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }

  // a chart of companies per province; a bar leads to the table filtered to that province
  await page.goto("/workspace/companies?view=chart&by=province");
  const bar = page.getByRole("link", { name: /Zzprov/ });
  await expect(bar).toContainText("2");
  await bar.click();
  await expect(page).toHaveURL(/f_province=Zzprov/);
  await expect(page.getByLabel(/^Nom · Grafica Alfa SL/)).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Província" })).toHaveValue("Zzprov");

  // the province filter is a menu of the values that exist, with counts
  await page.goto("/workspace/companies");
  await expect(page.getByRole("combobox", { name: "Província" }).locator("option", { hasText: "Zzprov (2)" })).toHaveCount(1);

  // a column preset swaps the columns in one click
  await page.goto("/workspace/companies?q=Grafica Alfa");
  await expect(page.getByRole("columnheader", { name: "Adreça" })).toHaveCount(0);
  await page.getByText("Columnes", { exact: false }).first().click();
  await page.getByRole("button", { name: "Adreça", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Adreça" })).toBeVisible();
  await page.getByRole("button", { name: "Resum", exact: true }).click(); // the menu stays open after a refresh
  await expect(page.getByRole("columnheader", { name: "Ubicació" })).toBeVisible();

  // visits have a tab of the signed-in person's own (none yet)
  await page.goto("/workspace/visits");
  await page.getByRole("navigation", { name: "Vistes" }).getByRole("link", { name: /^Les meves/ }).click();
  await expect(page).toHaveURL(/tab=mine/);
  await expect(page.getByText("Cap resultat")).toBeVisible();
});
