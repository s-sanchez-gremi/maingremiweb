// The CRM side of a form response: the lead and its source, follow-up (status, note, conversion into a client), the lead lists and
// search, and the right to erasure. The response itself comes in through the Forms app's public API, like a visitor's would.
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { CRM_URL as CRM, E2E_DB, FORMS_URL as FORMS } from "@apex/e2e/constants";
import { solve } from "@apex/forms/pow";

const sql = postgres(E2E_DB, { max: 2 });
const L = (ca: string) => ({ ca, es: "", en: "" });
const F = (type: string, data: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), type, data: { label: L(type), required: "no", ...data } });
const count = async (table: string, where = sql``) => Number((await sql`select count(*)::int n from ${sql(table)} ${where}`)[0].n);

async function login(page: Page, base: string) {
  await page.goto(base + "/admin/login");
  await page.getByLabel("Correu electrònic").fill("admin@e2e.test");
  await page.getByLabel("Contrasenya").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
}

test.afterAll(async () => { await sql.end(); });

test("a response becomes a lead in the CRM: follow-up, conversion into a client, search, and erasure of everything", async ({ page, request }) => {
  const nom = F("text", { label: L("Nom"), required: "yes", map: "name" });
  const em = F("email", { label: L("Correu"), required: "yes", map: "email" });
  const cv = F("file", { label: L("CV") });
  const [form] = await sql`insert into forms (name, slug, fields, destination, active, consent)
    values ('Leads CRM e2e', 'leads-crm-e2e', ${sql.json([nom, em, cv] as never)}, 'crm_lead', true, ${sql.json(L("Accepto") as never)}) returning id`;
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("contingut-secret-leads")]);

  // the visitor's side, through the Forms app's public API
  const ch = await (await request.get(`${FORMS}/api/forms/leads-crm-e2e/challenge`)).json();
  const res = await request.post(`${FORMS}/api/forms/leads-crm-e2e/submit`, {
    headers: { "x-forwarded-for": "198.51.100.77" },
    multipart: {
      payload: JSON.stringify({ locale: "ca", answers: { [nom.id]: "Eva Prats", [em.id]: "eva.prats@e2e.test" }, consent: true, newsletter: false, pow: { ...ch, number: solve(ch) }, sourcePath: "/ca/prova", theme: "e2e", utm: {} }),
      [`file:${cv.id}`]: { name: "cv.pdf", mimeType: "application/octet-stream", buffer: pdf },
    },
  });
  expect(res.status()).toBe(200);
  const [sub] = await sql`select id from submissions where form_id = ${form.id}`;

  // staff of the Forms app can reach the stored file through a signed link (kept to prove erasure later)
  await login(page, FORMS);
  const dl = await page.request.get(`${FORMS}/admin/forms/${form.id}/file?sub=${sub.id}&field=${cv.id}`, { maxRedirects: 0 });
  expect(dl.status()).toBe(302);
  const signed = dl.headers().location;
  expect((await fetch(signed)).status).toBe(200);

  // the CRM shows the contact with its source
  await login(page, CRM);
  await page.goto("/admin/leads");
  await expect(page.getByText("eva.prats@e2e.test")).toBeVisible();

  // lead follow-up: status, note, conversion into a client
  await page.getByRole("link", { name: /Eva Prats/ }).first().click();
  await page.getByLabel("Estat").selectOption("contacted");
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Desat");
  await page.getByLabel("Nova nota").fill("Trucar dimarts");
  await page.getByRole("button", { name: "Afegeix la nota" }).click();
  await expect(page.getByText("Trucar dimarts")).toBeVisible();
  await page.getByRole("button", { name: "Converteix en client" }).click();
  await expect(page).toHaveURL(/\/admin\/clients\/[0-9a-f-]{36}/);
  expect(await count("clients", sql`where email = 'eva.prats@e2e.test'`)).toBe(1);
  await page.goto("/admin/leads?status=won&q=eva.prats");
  await expect(page.getByText("eva.prats@e2e.test")).toBeVisible();
  await page.goto("/admin/leads?view=people&q=" + encodeURIComponent("eva.prats@e2e"));
  await expect(page.getByRole("columnheader", { name: "Peticions" })).toBeVisible();
  await expect(page.getByText("eva.prats@e2e.test")).toBeVisible();
  await page.goto("/admin/search?q=eva.prats%40e2e");
  await expect(page.getByRole("heading", { name: /Contactes i peticions/ })).toBeVisible();
  await page.goto("/admin/leads?status=lost&q=eva.prats");
  await expect(page.getByText("eva.prats@e2e.test")).toHaveCount(0);

  // right to erasure: contact, lead, notes, the client made from it, submission, file
  await page.goto("/admin/leads?q=eva.prats");
  await page.getByRole("link", { name: /Eva Prats/ }).first().click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Elimina les dades" }).first().click();
  await expect(page.getByRole("status")).toContainText("eliminats");
  expect(await count("clients", sql`where email = 'eva.prats@e2e.test'`)).toBe(0);
  expect(await count("contacts", sql`where email = 'eva.prats@e2e.test'`)).toBe(0);
  expect(await count("submissions", sql`where form_id = ${form.id}`)).toBe(0);
  expect((await fetch(signed)).status).toBe(404); // the stored file is really gone
});
