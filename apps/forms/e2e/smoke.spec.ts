import { expect, test } from "@playwright/test";

test("the Forms app is up, closed to visitors, hidden from search engines and cannot be framed", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /");

  // not logged in: the staff side sends you to the login page
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);

  const res = await request.get("/admin/login");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["content-security-policy"]).toContain("default-src");
});

test("staff log in with the same accounts, in a session of their own", async ({ page, context }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Correu electrònic").fill("editor@e2e.test");
  await page.getByLabel("Contrasenya").fill(process.env.E2E_EDITOR_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();

  const cookies = await context.cookies();
  expect(cookies.map((c) => c.name)).toContain("apex_forms_session");
  expect(cookies.map((c) => c.name)).not.toContain("apex_session");
  expect(cookies.map((c) => c.name)).not.toContain("apex_crm_session");

  await page.getByRole("button", { name: "Surt" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("the scheduler endpoint refuses callers without the secret", async ({ request }) => {
  expect((await request.post("/api/cron/tick")).status()).toBe(401);
});
