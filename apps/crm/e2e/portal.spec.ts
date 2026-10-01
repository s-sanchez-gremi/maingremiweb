import AxeBuilder from "@axe-core/playwright";
import { expect, request as pwRequest, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "@apex/e2e/constants";

const sql = postgres(E2E_DB, { max: 1 });
const PW = "portal-e2e-password-1";

async function staffLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Correu electrònic").fill("admin@e2e.test");
  await page.getByLabel("Contrasenya").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
}

test("client portal: invite → set password → sees only own project and shared documents; isolated from staff and other clients", async ({ page, browser, baseURL }) => {
  // two clients, each with a project; client A also has a shared and an unshared link, client B a shared one
  await sql`delete from clients where name like 'PORTAL %'`;
  const [ca] = await sql`insert into clients (name) values ('PORTAL Client A') returning id`;
  const [cb] = await sql`insert into clients (name) values ('PORTAL Client B') returning id`;
  const [pa] = await sql`insert into projects (name, client_id) values ('Projecte A visible', ${ca.id}) returning id`;
  const [pb] = await sql`insert into projects (name, client_id) values ('Projecte B secret', ${cb.id}) returning id`;
  await sql`insert into project_documents (project_id, kind, title, url, shared) values (${pa.id}, 'link', 'Brief compartit', 'https://example.com/brief', true)`;
  await sql`insert into project_documents (project_id, kind, title, url, shared) values (${pa.id}, 'link', 'Nota interna', 'https://example.com/intern', false)`;
  const [fb] = await sql`insert into project_documents (project_id, kind, title, file_key, file_name, mime, size, shared) values (${pb.id}, 'file', 'Contracte B', 'projects/x/none.pdf', 'b.pdf', 'application/pdf', 1, true) returning id`;

  // staff invite client A's contact person
  await staffLogin(page);
  await page.goto(`/admin/clients/${ca.id}`);
  await page.locator(".card", { hasText: "Accés al portal" }).getByLabel("Correu").fill("ana@portal-e2e.test");
  await page.getByRole("button", { name: "Convida" }).click();
  await expect(page.getByText("Invitació enviada.")).toBeVisible();
  const [mail] = await sql`select payload from outbox where payload->>'to' = 'ana@portal-e2e.test' order by id desc limit 1`;
  const token = /token=([\w-]+)/.exec(mail.payload.text)![1];

  // the client: a clean browser with no staff session
  const ctx = await browser.newContext({ baseURL });
  const c = await ctx.newPage();
  await c.goto("/portal");
  await expect(c).toHaveURL(/\/portal\/login/);
  await c.goto(`/portal/activate?token=${token}`);
  await c.getByLabel("Contrasenya nova").fill(PW);
  await c.getByLabel("Repeteix-la").fill(PW);
  await c.getByRole("button", { name: "Desa la contrasenya" }).click();
  await expect(c.getByRole("status")).toContainText("Contrasenya creada");
  await c.goto(`/portal/activate?token=${token}`); // the link is single-use
  await expect(c.locator(".msg.err")).toContainText("no és vàlid");

  await c.goto("/portal/login");
  await c.getByLabel("Correu electrònic").fill("ana@portal-e2e.test");
  await c.getByLabel("Contrasenya").fill("wrong-password-123");
  await c.getByRole("button", { name: "Entra" }).click();
  await expect(c.locator(".msg.err")).toContainText("incorrectes");
  await c.getByLabel("Correu electrònic").fill("ana@portal-e2e.test"); // the form is cleared after a failed attempt
  await c.getByLabel("Contrasenya").fill(PW);
  await c.getByRole("button", { name: "Entra" }).click();

  await expect(c.getByRole("heading", { name: "PORTAL Client A" })).toBeVisible();
  await expect(c.getByText("Projecte A visible")).toBeVisible();
  await expect(c.getByRole("link", { name: "Brief compartit" })).toBeVisible();
  await expect(c.getByText("Nota interna")).toHaveCount(0);
  await expect(c.getByText("Projecte B secret")).toHaveCount(0);
  await expect(c).toHaveTitle(/Portal de clients/); // the title streams in after the first paint on a slow machine; axe must not run before it
  const a11y = await new AxeBuilder({ page: c }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(a11y.violations).toEqual([]);

  // isolation: no staff area, no other client's file, nothing without a session
  expect((await c.request.get("/admin/leads", { maxRedirects: 0 })).status()).toBe(307); // sent to the staff login, never shown
  expect((await c.goto("/admin"))?.url()).toContain("/admin/login");
  expect((await c.request.get(`/portal/file/${fb.id}`, { maxRedirects: 0 })).status()).toBe(404);
  const anon = await pwRequest.newContext({ baseURL });
  expect((await anon.get(`/portal/file/${fb.id}`, { maxRedirects: 0 })).status()).toBe(401);
  // the staff session is not a portal session
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/portal\/login/);

  // staff disable the account: the open session stops working at once
  await page.goto(`/admin/clients/${ca.id}`);
  await page.getByRole("button", { name: "Desactiva" }).click();
  await expect(page.getByRole("button", { name: "Activa", exact: true })).toBeVisible(); // wait until the change is saved
  await c.goto("/portal");
  await expect(c).toHaveURL(/\/portal\/login/);

  // forgot password gives the same answer for an unknown address
  await c.goto("/portal/forgot");
  await c.getByLabel("Correu electrònic").fill("ghost@nowhere.test");
  await c.getByRole("button", { name: "Envia l'enllaç" }).click();
  await expect(c.getByRole("status")).toContainText("Si el correu té accés");
  expect((await sql`select 1 from outbox where payload->>'to' = 'ghost@nowhere.test'`).length).toBe(0);
  await ctx.close();
});

test("portal pages are not indexed and are not frameable", async ({ request }) => {
  const r = await request.get("/portal/login");
  expect(r.headers()["x-frame-options"]).toBe("DENY");
  expect(r.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(await r.text()).toContain("noindex");
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /"); // the CRM host is not for search engines
});
