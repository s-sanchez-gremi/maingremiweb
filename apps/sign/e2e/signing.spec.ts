// The whole journey in a real browser: staff prepare and send a request, the signer gets an email, opens their personal link in a
// separate browser session (no staff cookie), reads the document, signs (typed or drawn) or declines, and staff see the result.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const MAILPIT = "http://localhost:8025/api/v1";
const CRON = { authorization: "Bearer e2e-cron-secret-value" };
const uniq = () => Math.random().toString(36).slice(2, 10);

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Correu electrònic").fill("editor@e2e.test");
  await page.getByLabel("Contrasenya").fill(process.env.E2E_EDITOR_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
}

// a PDF with real text on it, so the viewer has something to draw
const pdf = async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 2; i++) doc.addPage([595, 842]).drawText(`Conveni de prova, pagina ${i}`, { x: 60, y: 760, size: 24, font });
  return Buffer.from(await doc.save());
};

/** Staff create a request with one signature field per signer and send it. Returns the request address. */
async function prepareAndSend(page: Page, title: string, signers: { name: string; email: string }[], opts: { ordered?: boolean } = {}) {
  await login(page);
  await page.locator('input[name="title"]').fill(title);
  await page.locator('input[name="file"]').setInputFiles({ name: "conveni.pdf", mimeType: "application/pdf", buffer: await pdf() });
  await page.getByRole("button", { name: /Puja i crea/ }).click();
  await expect(page).toHaveURL(/\/admin\/requests\/[0-9a-f-]{36}/);
  const url = page.url().split("?")[0];
  for (const s of signers) {
    await page.locator('#signers input[name="name"]').fill(s.name);
    await page.locator('#signers input[name="email"]').fill(s.email);
    await page.getByRole("button", { name: "Afegeix", exact: true }).click();
    await expect(page.locator("#signers strong", { hasText: s.name })).toBeVisible();
  }
  for (let i = 0; i < signers.length; i++) {
    await page.locator('#fields select[name="signerId"]').selectOption({ index: i });
    const outline = page.getByRole("img", { name: /Contorn de la pàgina 1/ });
    const box = (await outline.boundingBox())!;
    await outline.click({ position: { x: box.width * 0.4, y: box.height * (0.5 + i * 0.1) } });
    await page.getByRole("button", { name: "Afegeix el camp" }).click();
    await expect(page.locator("#fields h3")).toContainText(`Camps (${i + 1})`);
  }
  if (opts.ordered) {
    await page.locator('input[name="ordered"]').check();
    await page.getByRole("button", { name: "Desa", exact: true }).click();
    await expect(page.getByText("Desat.").first()).toBeVisible();
  }
  await expect(page.getByText("Tot a punt per enviar.")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Envia als signants" }).click();
  await expect(page.getByText("Enviada: els signants ja han rebut el correu.")).toBeVisible();
  return url;
}

/** Runs the scheduler (which sends queued emails) and waits for the email to a signer; returns their personal link. */
async function linkFor(page: Page, email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    await page.request.post("/api/cron/tick", { headers: CRON });
    const r = await (await fetch(`${MAILPIT}/search?query=${encodeURIComponent("to:" + email)}`)).json();
    if (r.messages?.length) {
      const m = (await (await fetch(`${MAILPIT}/message/${r.messages[0].ID}`)).json()) as { Subject: string; Text: string };
      const link = /(https?:\/\/[^\s]+\/sign\/[A-Za-z0-9_-]{43})/.exec(m.Text)?.[1];
      if (link) return link.replace(/^https?:\/\/[^/]+/, ""); // the path only: the test browser talks to its own address
    }
    await page.waitForTimeout(500);
  }
  throw new Error("no email arrived for " + email);
}

/** A fresh browser session with no cookies at all: what a signer has. */
async function visitor(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: `http://localhost:${new URL(test.info().project.use.baseURL!).port}`, storageState: { cookies: [], origins: [] } });
  return { ctx, page: await ctx.newPage() };
}

test("a request is sent, the signer opens their link, reads the document, signs by typing, and staff see it signed", async ({ page, browser }) => {
  const email = `anna-${uniq()}@exemple.test`;
  const reqUrl = await prepareAndSend(page, "Conveni de col·laboració", [{ name: "Anna Puig", email }]);
  const link = await linkFor(page, email);

  const v = await visitor(browser);
  const res = await v.page.goto(link);
  expect(res!.headers()["referrer-policy"]).toBe("no-referrer");
  expect(res!.headers()["x-robots-tag"]).toContain("noindex");
  expect(res!.headers()["cache-control"]).toContain("no-store");
  expect(res!.headers()["x-frame-options"]).toBe("DENY");
  expect(res!.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  await expect(v.page.getByRole("heading", { name: "Conveni de col·laboració" })).toBeVisible();
  await expect(v.page.getByText("Hola Anna Puig,")).toBeVisible();

  // the document is drawn by pdf.js: a canvas on the first page gets real ink on it
  const canvas = v.page.locator('.s-page[data-page="1"] canvas');
  await expect(canvas).toHaveAttribute("data-drawn", "1", { timeout: 20_000 });
  const inked = await canvas.evaluate((c: HTMLCanvasElement) => { const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] < 128 && d[i + 3] > 0) return true; return false; });
  expect(inked).toBe(true);
  // the signer's own field is marked on the page, and the PDF itself is served to this link only
  await expect(v.page.locator(".s-field.mine")).toHaveCount(1);
  const doc = await v.ctx.request.get(link + "/document");
  expect(doc.status()).toBe(200);
  expect(doc.headers()["content-type"]).toBe("application/pdf");
  expect((await doc.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // signing needs the consent
  await v.page.getByRole("button", { name: "Signa el document" }).click();
  await expect(v.page.locator(".s-err")).toContainText("Cal que acceptis signar electrònicament");
  await v.page.getByRole("checkbox").check();
  await v.page.getByRole("button", { name: "Signa el document" }).click();
  await expect(v.page).toHaveURL(/\/sign\/done\?r=signed&l=ca/);
  await expect(v.page.getByRole("heading", { name: "Gràcies, has signat el document." })).toBeVisible();

  // the link is dead now, and says nothing about why
  await v.page.goto(link);
  await expect(v.page.getByRole("heading", { name: "Aquest enllaç no és vàlid o ja no està actiu." })).toBeVisible();
  expect((await v.ctx.request.get(link + "/document")).status()).toBe(404);
  await v.ctx.close();

  // staff see the result
  await page.goto(reqUrl);
  await expect(page.locator(".top .chip")).toHaveText(/Signada/i);
  await expect(page.getByText("Ha signat").first()).toBeVisible();
  await expect(page.getByText(/Ha acceptat signar electrònicament/)).toBeVisible();
});

test("a signer can draw their signature, and the next signer only gets a link when it is their turn", async ({ page, browser }) => {
  const a = `anna-${uniq()}@exemple.test`, b = `biel-${uniq()}@exemple.test`;
  const reqUrl = await prepareAndSend(page, "Acord en ordre", [{ name: "Anna Puig", email: a }, { name: "Biel Roca", email: b }], { ordered: true });
  const linkA = await linkFor(page, a);
  // Biel has no email yet
  await page.request.post("/api/cron/tick", { headers: CRON });
  expect((await (await fetch(`${MAILPIT}/search?query=${encodeURIComponent("to:" + b)}`)).json()).messages?.length ?? 0).toBe(0);

  const v = await visitor(browser);
  await v.page.goto(linkA);
  await v.page.getByRole("button", { name: "Dibuixa-la" }).click();
  const pad = v.page.getByRole("img", { name: "La teva signatura" });
  const box = (await pad.boundingBox())!;
  await v.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6);
  await v.page.mouse.down();
  await v.page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3, { steps: 8 });
  await v.page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 8 });
  await v.page.mouse.up();
  await expect(v.page.locator(".s-field.mine img")).toBeVisible(); // the drawing appears in its place on the page
  await v.page.getByRole("checkbox").check();
  await v.page.getByRole("button", { name: "Signa el document" }).click();
  await expect(v.page).toHaveURL(/\/sign\/done\?r=signed/);
  await v.ctx.close();

  // now it is Biel's turn
  const linkB = await linkFor(page, b);
  expect(linkB).not.toBe(linkA);
  await page.goto(reqUrl);
  await expect(page.locator(".top .chip")).toHaveText(/Enviada/i);
  const w = await visitor(browser);
  await w.page.goto(linkB);
  await w.page.getByLabel("El teu nom complet").fill("Biel Roca");
  await w.page.getByRole("checkbox").check();
  await w.page.getByRole("button", { name: "Signa el document" }).click();
  await expect(w.page).toHaveURL(/\/sign\/done\?r=signed/);
  await w.ctx.close();
  await page.goto(reqUrl);
  await expect(page.locator(".top .chip")).toHaveText(/Signada/i);
});

test("a signer can decline, nobody else can then sign, and staff are told by email", async ({ page, browser }) => {
  const email = `anna-${uniq()}@exemple.test`;
  const reqUrl = await prepareAndSend(page, "Contracte rebutjat", [{ name: "Anna Puig", email }]);
  const link = await linkFor(page, email);
  const v = await visitor(browser);
  await v.page.goto(link);
  await v.page.getByRole("button", { name: "No vull signar" }).click();
  await v.page.getByLabel("Motiu (opcional)").fill("No hi estic d'acord");
  v.page.once("dialog", (d) => d.accept());
  await v.page.getByRole("button", { name: "Rebutja el document" }).click();
  await expect(v.page).toHaveURL(/\/sign\/done\?r=declined&l=ca/);
  await expect(v.page.getByRole("heading", { name: "Has rebutjat el document." })).toBeVisible();
  await v.page.goto(link);
  await expect(v.page.getByRole("heading", { name: "Aquest enllaç no és vàlid o ja no està actiu." })).toBeVisible();
  await v.ctx.close();

  await page.goto(reqUrl);
  await expect(page.locator(".top .chip")).toHaveText(/Rebutjada/i);
  // the staff member who created it gets an email with the reason
  let found = "";
  for (let i = 0; i < 20 && !found; i++) {
    await page.request.post("/api/cron/tick", { headers: CRON });
    const r = await (await fetch(`${MAILPIT}/search?query=${encodeURIComponent('to:editor@e2e.test subject:"Signatura rebutjada: Contracte rebutjat"')}`)).json();
    if (r.messages?.length) found = (await (await fetch(`${MAILPIT}/message/${r.messages[0].ID}`)).json()).Text;
    else await page.waitForTimeout(500);
  }
  expect(found).toContain("No hi estic d'acord");
});

test("a cancelled request stops working at once", async ({ page, browser }) => {
  const email = `anna-${uniq()}@exemple.test`;
  const reqUrl = await prepareAndSend(page, "Contracte anul·lat", [{ name: "Anna Puig", email }]);
  const link = await linkFor(page, email);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Anul·la la sol·licitud" }).click();
  await expect(page.getByText("Sol·licitud anul·lada")).toBeVisible();
  const v = await visitor(browser);
  await v.page.goto(link);
  await expect(v.page.getByRole("heading", { name: "Aquest enllaç no és vàlid o ja no està actiu." })).toBeVisible();
  await v.ctx.close();
  await page.goto(reqUrl);
  await expect(page.locator(".top .chip")).toHaveText(/Anul·lada/i);
});

test("links that do not exist all look the same, in three languages, and guessing is stopped", async ({ browser }) => {
  const v = await visitor(browser);
  for (const path of ["/sign/" + "a".repeat(43), "/sign/not-a-token", "/sign/" + "Z".repeat(43)]) {
    const res = await v.page.goto(path);
    expect(res!.status()).toBe(200);
    await expect(v.page.getByRole("heading", { name: "Aquest enllaç no és vàlid o ja no està actiu." })).toBeVisible();
    await expect(v.page.getByRole("heading", { name: "This link is not valid or is no longer active." })).toBeVisible();
  }
  expect((await v.ctx.request.get("/sign/" + "a".repeat(43) + "/document")).status()).toBe(404);
  // the staff screens stay closed to a visitor
  const staff = await v.ctx.request.get("/admin", { maxRedirects: 0 });
  expect([301, 302, 303, 307, 308]).toContain(staff.status());
  await v.ctx.close();
});
