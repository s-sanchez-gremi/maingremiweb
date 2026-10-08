import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { ADMIN_URL, E2E_DB } from "@apex/e2e/constants";

// The staff bar on public pages (drawn by the website; the admin is another app): never for visitors (not even a request),
// and for staff it opens the editor of the page shown. Signing in happens in the admin app; its session cookie is the one the website reads.
test("staff bar: hidden from visitors, edits the current page, signs out where you are", async ({ page }) => {
  const sql = postgres(E2E_DB, { max: 1 });
  const slug = `barra-${Date.now()}`;
  const [{ id }] = await sql`insert into entries (type) values ('post') returning id`;
  await sql`insert into entry_translations (entry_id, locale, title, slug, status, live)
    values (${id}, 'ca', 'Barra', ${slug}, 'published', ${sql.json({ title: "Barra", slug, sections: [], seo: {}, publishedAt: "2099-01-01T00:00:00.000Z" })})`;
  await sql.end();
  const path = `/ca/blog/${slug}`;

  const asked: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/admin/bar")) asked.push(r.url()); });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("navigation", { name: "Barra d'administració" })).toHaveCount(0);
  expect(asked).toEqual([]);

  await page.goto(`${ADMIN_URL}/admin/login`);
  await page.getByLabel("Correu electrònic").fill("editor@e2e.test");
  await page.getByLabel("Contrasenya").fill(process.env.E2E_EDITOR_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();

  await page.goto(path);
  const bar = page.getByRole("navigation", { name: "Barra d'administració" });
  await expect(bar.getByRole("link", { name: /Edita aquesta pàgina/ })).toHaveAttribute("href", `${ADMIN_URL}/admin/content/${id}?locale=ca`);
  await expect(bar.getByText("Canvis sense publicar")).toHaveCount(0);
  await page.goto("/ca/blog");
  await expect(bar.getByRole("link", { name: "Tauler" })).toBeVisible();
  await expect(bar.getByRole("link", { name: /Edita/ })).toHaveCount(0); // a list, not a page

  await page.goto(path);
  await bar.getByRole("button", { name: "Surt" }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(bar).toHaveCount(0);
  expect((await page.context().cookies()).map((c) => c.name)).not.toContain("apex_staff");
  expect((await page.request.get("/admin/bar?path=/ca")).status()).toBe(401);
});
