// Media library: upload images and documents, copy a public link that anyone can open, filter, delete.
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Correu electrònic").fill("admin@e2e.test");
  await page.getByLabel("Contrasenya").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
}

const officeLike = () => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26), Buffer.from("[Content_Types].xml<Types/>")]);

test("upload documents, share their public link, filter and delete", async ({ page, context, request }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page);
  await page.goto("/admin/media");
  await expect(page.getByRole("heading", { name: "Fitxers i imatges" })).toBeVisible();

  const stamp = Date.now();
  const pdf = `Circular ${stamp}.pdf`, docx = `Inscripció ${stamp}.docx`;
  await page.getByLabel("Tria fitxers per pujar").setInputFiles([
    { name: pdf, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n%test\n") },
    { name: docx, mimeType: "application/octet-stream", buffer: officeLike() },
    { name: "dibuix.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") },
  ]);
  await expect(page.getByRole("alert").filter({ hasText: "dibuix.svg" })).toContainText("dibuix.svg: Format no admès"); // one bad file never stops the others
  const pdfCard = page.locator(`form[data-media="${pdf}"]`);
  const docCard = page.locator(`form[data-media="Inscripcio ${stamp}.docx"]`);
  await expect(pdfCard).toBeVisible();
  await expect(docCard).toContainText("Word");

  // Copy the link: short, readable, on the website's own address.
  await pdfCard.getByRole("button", { name: "Copia l'enllaç" }).click();
  await expect(pdfCard.getByRole("button", { name: "✓ Enllaç copiat" })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(new RegExp(`/fitxers/[0-9a-f]{8}/circular-${stamp}\\.pdf$`));
  expect(await pdfCard.getByLabel("Enllaç públic").inputValue()).toBe(link);

  // Anyone can open it, without a session.
  const path = new URL(link).pathname;
  const redirect = await request.get(path, { maxRedirects: 0 }); // a separate client: no staff session
  expect(redirect.status()).toBe(302);
  const file = await request.get(redirect.headers().location);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("application/pdf");
  expect((await file.body()).toString()).toContain("%test");
  expect((await request.get("/fitxers/00000000/res.pdf", { maxRedirects: 0 })).status()).toBe(404);

  // Filters and search.
  await page.getByRole("link", { name: "Imatges", exact: true }).click();
  await expect(pdfCard).toHaveCount(0);
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await expect(pdfCard).toBeVisible();
  await page.getByRole("searchbox").fill(`inscripcio ${stamp}`);
  await page.getByRole("button", { name: "Cerca" }).click();
  await expect(docCard).toBeVisible();
  await expect(pdfCard).toHaveCount(0);

  // Delete (after confirming): the link stops working.
  await page.goto("/admin/media");
  page.once("dialog", (d) => d.accept());
  await pdfCard.getByRole("button", { name: "Elimina" }).click();
  await expect(pdfCard).toHaveCount(0);
  expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(404);
});
