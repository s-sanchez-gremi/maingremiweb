import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { CRON_SECRET, E2E_DB, WEB_URL } from "@apex/e2e/constants";
import { slugify } from "@apex/core/slug";

async function login(page: Page, who: "admin" | "editor") {
  const password = who === "admin" ? process.env.E2E_ADMIN_PASSWORD! : process.env.E2E_EDITOR_PASSWORD!;
  await page.goto("/admin/login");
  await page.getByLabel("Correu electrònic").fill(`${who}@e2e.test`);
  await page.getByLabel("Contrasenya").fill(password);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
}

// The CMS is its own app; what it publishes is read on the PUBLIC website (another app, WEB_URL).
const status = async (page: Page, path: string) => (await page.request.get(WEB_URL + path)).status();
const html = async (page: Page, path: string) => (await page.request.get(WEB_URL + path)).text();

test("login: wrong password is refused and repeated failures are throttled", async ({ page }) => {
  await page.goto("/admin/login");
  const attempt = async (pw: string) => {
    await page.getByLabel("Correu electrònic").fill("nobody@e2e.test");
    await page.getByLabel("Contrasenya").fill(pw);
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/login")),
      page.getByRole("button", { name: "Entra" }).click(),
    ]);
  };
  for (let i = 0; i < 5; i++) {
    await attempt("wrong-password-" + i);
    await expect(page.getByText("Correu o contrasenya incorrectes.")).toBeVisible();
  }
  await attempt("wrong-again");
  await expect(page.getByText(/Massa intents/)).toBeVisible();
  await page.goto("/admin/content?type=post");
  await expect(page).toHaveURL(/\/admin\/login/); // no session, no access
});

test("draft → publish → live → edit stays hidden → republish → unpublish", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/content?type=post");
  await page.getByRole("button", { name: "Nou article" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/[0-9a-f-]{36}/);

  const title = `Prova e2e ${Date.now()}`;
  await page.getByLabel("Títol", { exact: true }).fill(title);
  await page.getByLabel("Slug (URL)").fill(""); // empty = derived from the title
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.locator(".col-main textarea").fill("Cos **important** de la prova");
  const path = `/ca/blog/${slugify(title)}`;

  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Desat");
  expect(await status(page, path)).toBe(404); // a draft is not public

  await page.getByRole("button", { name: "Publica", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Publicat");
  let body = await html(page, path);
  expect(body).toContain(title);
  expect(body).toContain("<strong>important</strong>");
  expect(body).toContain('<html lang="ca"');

  // Edit the draft: the public page must not change until it is published again.
  await page.getByLabel("Títol", { exact: true }).fill(title + " (v2)");
  await page.getByLabel("Slug (URL)").fill(slugify(title));
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByText("Canvis sense publicar")).toBeVisible();
  body = await html(page, path);
  expect(body).not.toContain("(v2)");

  await page.getByRole("button", { name: "Publica", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Publicat");
  expect(await html(page, path)).toContain(title + " (v2)");
  expect(await html(page, "/ca/blog")).toContain(title + " (v2)"); // the list updates too

  await page.getByRole("button", { name: "Passa a esborrany" }).click();
  await expect(page.getByRole("status")).toContainText("esborrany");
  expect(await status(page, path)).toBe(404);
});

test("scheduled publishing goes live when the cron job runs", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/content?type=page");
  await page.getByRole("button", { name: "Nova pàgina" }).click();
  const title = `Pàgina programada ${Date.now()}`;
  await page.getByLabel("Títol", { exact: true }).fill(title);
  await page.getByLabel("Slug (URL)").fill("");
  const path = `/ca/${slugify(title)}`;

  await page.getByLabel("Programa per a").fill("2035-01-01T10:00");
  await page.getByRole("button", { name: "Programa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Programat");
  expect(await status(page, path)).toBe(404);

  // Cron with the wrong secret does nothing; with the right one it publishes what is due.
  expect((await page.request.post("/api/cron/publish", { headers: { authorization: "Bearer nope" } })).status()).toBe(401);
  expect((await page.request.post(`${WEB_URL}/api/cron/revalidate`, { headers: { authorization: "Bearer nope" } })).status()).toBe(401);
  const sql = postgres(E2E_DB, { max: 1 });
  await sql`update entry_translations set publish_at = now() - interval '1 minute' where status = 'scheduled'`;
  await sql.end();
  const cron = await page.request.post("/api/cron/publish", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(await cron.json()).toEqual({ published: 1 });
  expect(await status(page, path)).toBe(200);
  expect(await html(page, path)).toContain(title);
});

test("editors cannot manage users or settings", async ({ page }) => {
  await login(page, "editor");
  await expect(page.getByRole("link", { name: "Equip" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Configuració" })).toHaveCount(0);
  expect((await page.goto("/admin/users"))?.status()).toBe(404);
  expect((await page.goto("/admin/settings"))?.status()).toBe(404);
  expect((await page.goto("/admin/errors"))?.status()).toBe(404);
  await page.goto("/admin/content?type=post"); // but they can do their job
  await expect(page.getByRole("button", { name: "Nou article" })).toBeVisible();
});

test("admins see system status and the error log; the scheduler heartbeat drives the deep health check", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin");
  await expect(page.getByText("Estat del sistema")).toBeVisible();
  await page.goto("/admin/errors");
  await expect(page.getByRole("heading", { name: "Errors" })).toBeVisible();
  await expect(page.getByText("No hi ha cap error obert.")).toBeVisible();
  const tick = await page.request.post("/api/cron/tick", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(tick.ok()).toBe(true);
  expect((await page.request.get("/api/health?deep=1")).status()).toBe(200);
});

test("a previous published version can be restored into the draft without touching the live page", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/content?type=post");
  await page.getByRole("button", { name: "Nou article" }).click();
  await page.waitForURL(/\/admin\/content\/[0-9a-f-]{36}/);
  const v1 = `Versió uno ${Date.now()}`, v2 = `Versió dos ${Date.now()}`;
  await page.getByLabel("Títol", { exact: true }).fill(v1);
  await page.getByRole("button", { name: "Publica" }).click();
  await expect(page.getByText("Publicat.")).toBeVisible();
  await page.getByLabel("Títol", { exact: true }).fill(v2);
  await page.getByRole("button", { name: "Publica" }).click();
  await expect(page.getByText("Publicat.")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Restaura" }).last().click(); // oldest version
  await expect(page.getByText("Versió restaurada")).toBeVisible();
  await expect(page.getByLabel("Títol", { exact: true })).toHaveValue(v1);
});
