// Cookie consent, campaign tags, external embeds and the Content-Security-Policy.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { CRON_SECRET, E2E_DB } from "@apex/e2e/constants";

test.use({ storageState: { cookies: [], origins: [] } }); // a brand-new visitor: no consent recorded yet

const sql = postgres(E2E_DB, { max: 2 });
const L = (ca: string) => ({ ca, es: ca, en: ca });
const AXE = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const consentCookie = async (page: Page) => {
  const c = (await page.context().cookies()).find((x) => x.name === "apex_consent");
  return c ? JSON.parse(decodeURIComponent(c.value)) : null;
};
const embedRoutes = async (page: Page) => {
  const hits: string[] = [];
  await page.route(/youtube-nocookie\.com/, (route) => { hits.push(route.request().url()); return route.fulfill({ contentType: "text/html", body: "<p>video</p>" }); });
  return hits;
};

test.beforeAll(async ({ request }) => {
  await sql`delete from entries`; await sql`delete from forms`; await sql`delete from contacts`; await sql`delete from categories`;
  const showcase = [
    { id: "t", type: "text", data: { body: "Consulta la [configuració de cookies](#cookie-settings) quan vulguis." } },
    { id: "e", type: "embed", data: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
    { id: "c", type: "cookieList", data: { heading: "" } },
  ];
  const [p] = await sql`insert into entries (type) values ('page') returning id`;
  const live = { title: "Política de cookies", slug: "cookies", sections: showcase, seo: {}, publishedAt: new Date().toISOString() };
  await sql`insert into entry_translations (entry_id, locale, title, slug, sections, status, live) values (${p.id}, 'ca', 'Política de cookies', 'cookies', ${sql.json(showcase as never)}, 'published', ${sql.json(live as never)})`;
  // a contact form to prove the remembered campaign tags reach the lead
  const nom = { id: crypto.randomUUID(), type: "text", data: { label: L("Nom"), required: "yes", map: "name" } };
  const em = { id: crypto.randomUUID(), type: "email", data: { label: L("Correu"), required: "yes", map: "email" } };
  await sql`insert into forms (name, slug, fields, destination, active, consent) values ('Camp', 'camp', ${sql.json([nom, em] as never)}, 'crm_lead', true, ${sql.json(L("Accepto") as never)})`;
  await request.post("/api/cron/revalidate", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
});
test.afterAll(async () => { await sql.end(); });

test("first visit shows the banner; accept and reject are equally prominent; nothing is stored before a choice", async ({ page }) => {
  await page.goto("/ca");
  const banner = page.getByRole("region", { name: "Cookies i privacitat" });
  await expect(banner).toBeVisible();
  expect(await consentCookie(page)).toBeNull();
  const accept = banner.getByRole("button", { name: "Acceptar-ho tot" });
  const reject = banner.getByRole("button", { name: "Rebutjar-ho tot" });
  const style = (b: typeof accept) => b.evaluate((el) => { const s = getComputedStyle(el); return [s.backgroundColor, s.color, s.borderColor, s.fontSize, s.fontWeight, s.paddingTop, s.paddingLeft].join("|"); });
  expect(await style(accept)).toBe(await style(reject)); // identical look: no dark pattern
  const [a, r] = [await accept.boundingBox(), await reject.boundingBox()];
  expect(a!.height).toBeGreaterThanOrEqual(44);
  expect(r!.height).toBe(a!.height);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  for (const size of [{ width: 375, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    const res = await new AxeBuilder({ page }).withTags(AXE).analyze();
    expect(res.violations.map((v) => `${v.id} ${v.nodes[0]?.target}`), `banner @${size.width}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  }
});

test("reject all: recorded, remembered, no external content, no campaign storage", async ({ page }) => {
  const hits = await embedRoutes(page);
  await page.goto("/ca/cookies?utm_source=butlleti");
  await page.getByRole("button", { name: "Rebutjar-ho tot" }).click();
  await expect(page.getByRole("region", { name: "Cookies i privacitat" })).toHaveCount(0);
  expect(await consentCookie(page)).toMatchObject({ v: 1, attribution: false, embeds: false });
  await page.reload();
  await expect(page.getByRole("region", { name: "Cookies i privacitat" })).toHaveCount(0); // remembered
  await expect(page.locator("iframe")).toHaveCount(0); // the video waits for a click
  expect(await page.evaluate(() => sessionStorage.getItem("apex_utm"))).toBeNull();
  expect(hits).toEqual([]); // not a single request to the external service
});

test("accept all: external video loads by itself and the campaign is remembered while browsing, then reaches the lead", async ({ page }) => {
  const hits = await embedRoutes(page);
  await page.goto("/ca/cookies?utm_source=butlleti&utm_campaign=tardor");
  await page.getByRole("button", { name: "Acceptar-ho tot" }).click();
  expect(await consentCookie(page)).toMatchObject({ attribution: true, embeds: true });
  await expect(page.locator("iframe[src*='youtube-nocookie.com/embed/dQw4w9WgXcQ']")).toBeVisible();
  expect(hits.length).toBeGreaterThan(0);
  expect(JSON.parse((await page.evaluate(() => sessionStorage.getItem("apex_utm")))!)).toEqual({ utm_source: "butlleti", utm_campaign: "tardor" });

  await page.goto("/ca/form/camp"); // a different page, no query string
  await page.getByLabel(/^Nom/).fill("Núria");
  await page.getByLabel(/^Correu/).fill("nuria@e2e.test");
  await page.getByLabel("Accepto").check();
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByRole("status")).toContainText("Gràcies");
  await expect.poll(async () => (await sql`select utm from leads join contacts on contacts.id = leads.contact_id where email = 'nuria@e2e.test'`)[0]?.utm).toEqual({ utm_source: "butlleti", utm_campaign: "tardor" });
});

test("without consent the campaign is only what is in the address at submit time", async ({ page }) => {
  await page.context().addCookies([{ name: "apex_consent", value: encodeURIComponent(JSON.stringify({ v: 1, t: new Date().toISOString(), attribution: false, embeds: false })), domain: "localhost", path: "/" }]);
  await page.goto("/ca?utm_source=facebook"); // visited, but not remembered
  await page.goto("/ca/form/camp");
  await page.getByLabel(/^Nom/).fill("Pere");
  await page.getByLabel(/^Correu/).fill("pere@e2e.test");
  await page.getByLabel("Accepto").check();
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByRole("status")).toContainText("Gràcies");
  await expect.poll(async () => (await sql`select utm from leads join contacts on contacts.id = leads.contact_id where email = 'pere@e2e.test'`)[0]?.utm).toEqual({});
});

test("preferences dialog: keyboard-operable, per-category choices, withdrawing consent erases what was kept", async ({ page }) => {
  await embedRoutes(page); // accepting loads the video; keep the external service out of our accessibility scan
  await page.goto("/ca/cookies?utm_source=butlleti");
  await page.getByRole("button", { name: "Acceptar-ho tot" }).click();
  expect(await page.evaluate(() => sessionStorage.getItem("apex_utm"))).not.toBeNull();

  const opener = page.getByRole("link", { name: "Configuració de cookies" }).first(); // the footer link is always there
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Preferències de cookies" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Necessàries")).toBeDisabled();
  await expect(dialog.getByLabel("Necessàries")).toBeChecked();
  const res = await new AxeBuilder({ page }).withTags(AXE).analyze();
  expect(res.violations.map((v) => `${v.id} ${v.nodes[0]?.target}`)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused(); // focus goes back where it was

  await opener.click();
  await dialog.getByLabel("Origen de la campanya").uncheck(); // keep external content, withdraw campaign tracking
  await dialog.getByRole("button", { name: "Desa les preferències" }).click();
  expect(await consentCookie(page)).toMatchObject({ attribution: false, embeds: true });
  expect(await page.evaluate(() => sessionStorage.getItem("apex_utm"))).toBeNull();
});

test("the cookie policy page lists exactly what the site stores, and its in-text link opens the preferences", async ({ page }) => {
  await page.goto("/ca/cookies");
  await page.getByRole("button", { name: "Rebutjar-ho tot" }).click();
  const table = page.getByRole("table");
  for (const name of ["apex_consent", "apex_session", "apex_utm", "YouTube / Adobe"]) await expect(table).toContainText(name);
  await page.getByRole("link", { name: "configuració de cookies", exact: true }).click(); // link written inside a text section
  await expect(page.getByRole("dialog", { name: "Preferències de cookies" })).toBeVisible();
  await page.keyboard.press("Escape");
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const r = await new AxeBuilder({ page }).withTags(AXE).analyze();
    expect(r.violations.map((v) => `${v.id} ${v.nodes[0]?.target}`), `cookie page @${width}`).toEqual([]);
  }
});

test("a facade 'always allow' shortcut records the choice for external content", async ({ page }) => {
  await embedRoutes(page);
  await page.goto("/ca/cookies");
  await page.getByRole("button", { name: "Rebutjar-ho tot" }).click();
  await page.getByRole("button", { name: "Permet sempre el contingut extern" }).click();
  expect(await consentCookie(page)).toMatchObject({ attribution: false, embeds: true });
  await expect(page.locator("iframe")).toBeVisible();
});

test("Content-Security-Policy: no violations in normal use, and a third-party script cannot run", async ({ page, request }) => {
  const violations: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text()); });
  await embedRoutes(page);
  for (const path of ["/ca", "/ca/blog", "/ca/cookies", "/ca/form/camp", "/styleguide"]) { await page.goto(path); await page.waitForLoadState("networkidle"); }
  expect(violations).toEqual([]);

  const csp = (await request.get("/ca")).headers()["content-security-policy"];
  expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toContain("http://localhost:9090"); // the media bucket origin, and nothing else
  expect(csp).not.toMatch(/script-src[^;]*https?:/);

  await page.goto("/ca");
  const blocked = await page.evaluate(() => new Promise<string>((resolve) => {
    document.addEventListener("securitypolicyviolation", (e) => resolve(e.violatedDirective));
    const s = document.createElement("script"); s.src = "https://evil.example/tracker.js"; document.head.appendChild(s);
    setTimeout(() => resolve("NOT BLOCKED"), 3000);
  }));
  expect(blocked).toContain("script-src");
});
