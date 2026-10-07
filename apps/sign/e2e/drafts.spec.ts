import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Correu electrònic").fill("editor@e2e.test");
  await page.getByLabel("Contrasenya").fill(process.env.E2E_EDITOR_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
}

const pdf = async (pages: number) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
};

test("staff prepare a draft: upload, signer, field placed by clicking on the page, check, delete", async ({ page }) => {
  await login(page);

  // a file that is not a PDF is refused with a message, and nothing is created
  await page.locator('input[name="file"]').setInputFiles({ name: "nota.pdf", mimeType: "application/pdf", buffer: Buffer.from("això no és un PDF") });
  await page.getByRole("button", { name: /Puja i crea/ }).click();
  await expect(page.locator("p.msg.err")).toContainText("no és un PDF");

  // a real PDF creates a draft
  await page.locator('input[name="title"]').fill("Conveni d'exemple");
  await page.locator('input[name="file"]').setInputFiles({ name: "conveni.pdf", mimeType: "application/pdf", buffer: await pdf(2) });
  await page.getByRole("button", { name: /Puja i crea/ }).click();
  await expect(page).toHaveURL(/\/admin\/requests\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: "Conveni d'exemple" })).toBeVisible();
  await expect(page.getByText("2 pàgines")).toBeVisible();
  await expect(page.getByText("Esborrany").first()).toBeVisible();

  // not ready: nobody to sign yet
  await expect(page.getByText("Cal almenys un signant.")).toBeVisible();

  // add a signer; a repeated address is refused
  await page.locator('#signers input[name="name"]').fill("Anna Puig");
  await page.locator('#signers input[name="email"]').fill("anna@exemple.test");
  await page.getByRole("button", { name: "Afegeix", exact: true }).click();
  await expect(page.locator("#signers strong", { hasText: "1. Anna Puig" })).toBeVisible();
  await expect(page.getByText("Cada signant necessita almenys un camp de signatura obligatori.")).toBeVisible();
  await page.locator('#signers input[name="name"]').fill("Altra Anna");
  await page.locator('#signers input[name="email"]').fill("ANNA@exemple.test");
  await page.getByRole("button", { name: "Afegeix", exact: true }).click();
  await expect(page.locator("p.msg.err")).toContainText("ja és a la llista");

  // place a signature by clicking on the page outline, then add it
  const outline = page.getByRole("img", { name: /Contorn de la pàgina 1/ });
  const box = (await outline.boundingBox())!;
  await outline.click({ position: { x: box.width * 0.5, y: box.height * 0.9 } });
  await expect(page.locator('input[name="x"]')).toHaveValue(/^3[45]([.][0-9]+)?$/);   // centred on the click: 50 - 30/2 (the click lands on a fraction of a pixel)
  await expect(page.locator('input[name="y"]')).toHaveValue(/^8[56]([.][0-9]+)?$/);   // 90 - 8/2
  await page.getByRole("button", { name: "Afegeix el camp" }).click();
  await expect(page.getByText(/pàgina 1 · 3[45]([.][0-9]+)?%, 8[56]([.][0-9]+)?% · 30×8%/)).toBeVisible();

  // now everything is in place
  await expect(page.getByText("Tot a punt.")).toBeVisible();

  // a field that sticks out of the page cannot be added
  await page.locator('input[name="x"]').fill("90");
  await expect(page.getByRole("button", { name: "Afegeix el camp" })).toBeDisabled();

  // settings are saved
  await page.locator('select[name="locale"]').selectOption("es");
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Desat." })).toBeVisible();
  await expect(page.locator('select[name="locale"]')).toHaveValue("es");

  // it shows in the list, then the draft is deleted
  await page.goto("/admin");
  await expect(page.getByText("Conveni d'exemple")).toBeVisible();
  await page.getByRole("link", { name: /Conveni d'exemple/ }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Elimina l'esborrany" }).click();
  await expect(page).toHaveURL(/\/admin\?deleted=1/);
  await expect(page.getByText("Esborrany eliminat.")).toBeVisible();
  await expect(page.getByText("Conveni d'exemple")).toHaveCount(0);
});

test("the editor pages are closed to visitors", async ({ request }) => {
  const res = await request.get("/admin/requests/00000000-0000-4000-8000-000000000000", { maxRedirects: 0 });
  expect([301, 302, 303, 307, 308]).toContain(res.status());
  expect(res.headers()["location"]).toContain("/admin/login");
});
