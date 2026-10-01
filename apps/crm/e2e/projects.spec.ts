import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Correu electrònic").fill("editor@e2e.test"); // editors run projects too
  await page.getByLabel("Contrasenya").fill(process.env.E2E_EDITOR_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
}

test("project manager: tasks (own list, done, reopen) and documents (link, private file, signed download)", async ({ page }) => {
  await login(page);
  await page.goto("/admin/projects");
  await page.getByLabel("Nom", { exact: true }).fill("Projecte PM e2e");
  await page.getByRole("button", { name: "Crea el projecte" }).click();
  await expect(page.getByRole("heading", { name: "Projecte PM e2e" })).toBeVisible();
  const projectUrl = page.url();

  // tasks
  await page.getByLabel("Nova tasca").fill("Enviar el pressupost");
  await page.getByLabel("Responsable").selectOption({ label: "editor@e2e.test" });
  await page.getByLabel("Data límit").fill("2020-01-01");
  await page.getByRole("button", { name: "Afegeix", exact: true }).click();
  await expect(page.getByText("Enviar el pressupost")).toBeVisible();
  await expect(page.getByText("⚠ Venç")).toBeVisible(); // overdue is flagged
  await page.goto("/admin/tasks");
  await expect(page.getByText("Enviar el pressupost")).toBeVisible();
  await page.getByRole("button", { name: /Marca com a feta: Enviar/ }).click();
  await expect(page.getByText("Enviar el pressupost")).toHaveCount(0); // done tasks are hidden by default
  await page.getByRole("link", { name: "Mostra les fetes" }).click();
  await page.getByRole("button", { name: /Reobre: Enviar/ }).click();
  await expect(page.getByText("Enviar el pressupost")).toBeVisible();

  // documents: a link, then a real PDF that is stored privately and downloaded through a signed link
  await page.goto(projectUrl);
  await page.getByLabel("…o enllaç").fill("https://example.com/brief");
  await page.getByLabel("Títol (opcional)").fill("Brief del client");
  await page.getByRole("button", { name: "Afegeix el document" }).click();
  await expect(page.getByRole("link", { name: "Brief del client" })).toBeVisible();

  await page.getByLabel(/^Fitxer/).setInputFiles({ name: "contracte.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 contracte-secret-e2e") });
  await page.getByRole("button", { name: "Afegeix el document" }).click();
  await expect(page.getByRole("link", { name: "contracte.pdf" })).toBeVisible();
  const href = await page.getByRole("link", { name: "contracte.pdf" }).first().getAttribute("href");
  const dl = await page.request.get(href!, { maxRedirects: 0 });
  expect(dl.status()).toBe(302);
  expect(dl.headers().location).toContain("X-Amz-Signature");
  const file = await fetch(dl.headers().location);
  expect(await file.text()).toContain("contracte-secret-e2e");
  // not reachable without a session, nor through another project's URL
  const anon = await (await import("@playwright/test")).request.newContext({ baseURL: page.url().split("/admin")[0] });
  expect((await anon.get(href!, { maxRedirects: 0 })).status()).toBe(401);
  expect((await page.request.get(href!.replace(/projects\/[0-9a-f-]{36}/, "projects/00000000-0000-0000-0000-000000000000"), { maxRedirects: 0 })).status()).toBe(404);

  // a disguised file is refused
  await page.getByLabel(/^Fitxer/).setInputFiles({ name: "virus.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ\x90\x00 malware") });
  await page.getByRole("button", { name: "Afegeix el document" }).click();
  await expect(page.locator(".msg.err")).toContainText("Format no admès");
});
