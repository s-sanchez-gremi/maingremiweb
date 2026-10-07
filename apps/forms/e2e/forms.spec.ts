// Form builder + lead pipeline, end to end: real browser, real production build, real database, real SMTP (Mailpit) and S3 mock.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import postgres from "postgres";
import { CRM_URL as CRM, E2E_DB, WEB_URL as WEB } from "@apex/e2e/constants"; // public pages are drawn by the website; the API and the builder live in the Forms app; leads and projects in the CRM app
import { solve } from "@apex/forms/pow";

const MAILPIT = "http://localhost:8025/api/v1";
const sql = postgres(E2E_DB, { max: 2 });
const L = (ca: string, es = "", en = "") => ({ ca, es, en });
const F = (type: string, data: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), type, data: { label: L(type), required: "no", ...data } });

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Correu electrònic").fill("admin@e2e.test");
  await page.getByLabel("Contrasenya").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
}

async function seedForm(slug: string, fields: unknown[], over: Record<string, unknown> = {}) {
  const [f] = await sql`insert into forms (name, slug, fields, destination, active, notifications, consent, newsletter, confirmation)
    values (${"Form " + slug}, ${slug}, ${sql.json(fields as never)}, ${(over.destination as string) ?? "responses_only"}, ${(over.active as boolean | undefined) ?? true},
            ${sql.json((over.notifications ?? {}) as never)}, ${sql.json((over.consent ?? {}) as never)}, ${sql.json((over.newsletter ?? {}) as never)}, ${sql.json({} as never)})
    returning id`;
  return f.id as string;
}

async function submitApi(request: APIRequestContext, slug: string, answers: Record<string, unknown>, o: { xff?: string; files?: Record<string, { name: string; buffer: Buffer }>; payload?: Record<string, unknown>; pow?: unknown; consent?: boolean } = {}) {
  const ch = await (await request.get(`/api/forms/${slug}/challenge`)).json();
  const pow = o.pow ?? { ...ch, number: solve(ch) };
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
    payload: JSON.stringify({ locale: "ca", answers, consent: o.consent ?? true, newsletter: false, pow, sourcePath: "/ca/prova", theme: "e2e", utm: {}, ...o.payload }),
  };
  for (const [id, f] of Object.entries(o.files ?? {})) multipart[`file:${id}`] = { name: f.name, mimeType: "application/octet-stream", buffer: f.buffer };
  return request.post(`/api/forms/${slug}/submit`, { multipart, headers: { "x-forwarded-for": o.xff ?? "198.51.100.1" } });
}

const count = async (table: string, where = sql``) => Number((await sql`select count(*)::int n from ${sql(table)} ${where}`)[0].n);

async function clearMail() { await fetch(`${MAILPIT}/messages`, { method: "DELETE" }); }
async function waitMail(to: string) {
  for (let i = 0; i < 40; i++) {
    const r = await (await fetch(`${MAILPIT}/search?query=${encodeURIComponent("to:" + to)}`)).json();
    if (r.messages?.length) return (await (await fetch(`${MAILPIT}/message/${r.messages[0].ID}`)).json()) as { Subject: string; Text: string };
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`no email to ${to}`);
}

// The CRM app has its own login and session cookie (the same accounts): tests that cross into it sign in there too.
async function loginCrm(page: Page) {
  await page.goto(CRM + "/admin/login");
  await page.getByLabel("Correu electrònic").fill("admin@e2e.test");
  await page.getByLabel("Contrasenya").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
}

test.beforeAll(async () => { await sql`delete from forms`; await sql`delete from contacts`; await sql`delete from newsletter_optins`; await clearMail(); });
test.afterAll(async () => { await sql.end(); });

test("build a form in the admin, publish it, submit it as a visitor: contact, lead, tags, consent and both emails", async ({ page }) => {
  await login(page);
  await page.goto("/admin/forms");
  await page.getByRole("button", { name: "Nou formulari" }).click();
  await expect(page).toHaveURL(/\/admin\/forms\/[0-9a-f-]{36}$/);

  await page.getByLabel("Nom intern").fill("Contacte e2e");
  await page.getByLabel("Enllaç (slug)").fill("contacte-e2e");
  await page.getByLabel("Obert: accepta respostes").check();

  const card = (n: number) => page.locator(".col-main > .card").nth(n + 1); // card 0 is the name/slug card
  const chip = (t: string) => page.locator(".add button", { hasText: t }).first();
  await chip("Text curt").click();
  await card(0).getByLabel("CA").first().fill("Nom");
  await card(0).getByLabel("Obligatori").selectOption("yes");
  await card(0).getByLabel("Guarda-ho al contacte com a").selectOption("name");
  await chip("Correu").click();
  await card(1).getByLabel("CA").first().fill("Correu electrònic");
  await card(1).getByLabel("Obligatori").selectOption("yes");
  await card(1).getByLabel("Guarda-ho al contacte com a").selectOption("email");

  await page.getByLabel("Crear contacte i lead al CRM").check();
  await page.getByRole("group", { name: /Text de consentiment/ }).getByLabel("CA").fill("Accepto la [política de privacitat](/ca/privacitat)");
  await page.getByLabel("Avisa l'equip per correu").selectOption("yes");
  await page.getByLabel("Adreces de l'equip").fill("equip@e2e.test");
  await page.getByLabel("Envia una confirmació a qui l'omple").selectOption("yes");
  await page.getByRole("group", { name: "Assumpte de la confirmació" }).getByLabel("CA").fill("Hem rebut el teu missatge");
  await page.getByRole("group", { name: "Text de la confirmació" }).getByLabel("CA").fill("Gràcies per escriure'ns, et respondrem aviat.");
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Desat");

  // A visitor uses the shareable link.
  await page.goto(WEB + "/ca/form/contacte-e2e?utm_source=butlleti&utm_campaign=tardor");
  await expect(page.getByRole("heading", { name: "Contacte e2e" })).toBeVisible();
  await page.getByLabel("Nom", { exact: false }).first().fill("Ana Puig");
  await page.getByLabel("Correu electrònic").fill("Ana@E2E.test");
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Cal acceptar-ho" }).or(page.getByText("Cal acceptar-ho"))).toBeVisible(); // consent is required
  await page.getByLabel(/Accepto la política de privacitat/).check();
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByRole("status")).toContainText("Gràcies");

  await expect.poll(() => count("leads")).toBe(1);
  const [c] = await sql`select * from contacts`;
  expect(c).toMatchObject({ email: "ana@e2e.test", name: "Ana Puig", locale: "ca" });
  const [lead] = await sql`select * from leads`;
  expect(lead).toMatchObject({ source_path: "/ca/form/contacte-e2e", locale: "ca", status: "new" });
  expect(lead.utm).toEqual({ utm_source: "butlleti", utm_campaign: "tardor" });
  const [sub] = await sql`select * from submissions`;
  expect(sub.consent_text).toBe("Accepto la [política de privacitat](/ca/privacitat)");
  expect(sub.consent_at).not.toBeNull();
  expect(sub.ip_hash).not.toContain("198"); // never the address itself

  const staff = await waitMail("equip@e2e.test");
  expect(staff.Text).toContain("Correu electrònic: ana@e2e.test");
  expect(staff.Text).toContain("utm_source=butlleti");
  const confirm = await waitMail("ana@e2e.test");
  expect(confirm.Subject).toBe("Hem rebut el teu missatge");
  expect(confirm.Text).toContain("Gràcies per escriure'ns");
});

test("multi-step form with conditional fields, validation, and no accessibility violations at each state", async ({ page }) => {
  const nom = F("text", { label: L("Nom"), required: "yes" });
  const brk = F("pagebreak", { title: L("Sobre el curs") });
  const nivell = F("dropdown", { label: L("Nivell"), required: "yes", options: [{ label: L("Nivell I") }, { label: L("Nivell II") }] });
  const motiu = F("text", { label: L("Motiu"), required: "yes", showField: nivell.id, showOp: "equals", showValue: "Nivell II" });
  await seedForm("pas-a-pas", [nom, brk, nivell, motiu], { consent: L("Accepto les condicions") });
  await page.goto(WEB + "/ca/form/pas-a-pas");
  const axe = async (label: string) => {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`), label).toEqual([]);
  };
  await page.waitForLoadState("networkidle");
  await axe("step 1");
  await expect(page.getByText("Pas 1 de 2")).toBeVisible();

  await page.getByRole("button", { name: "Següent" }).click(); // required name is empty: stays on step 1 with an error
  await expect(page.getByText("Aquest camp és obligatori")).toBeVisible();
  await expect(page.getByText("Pas 1 de 2")).toBeVisible();
  await expect(page.getByLabel(/^Nom/)).toBeFocused();
  await axe("step 1 with error");

  await page.getByLabel(/^Nom/).fill("Bea");
  await page.getByRole("button", { name: "Següent" }).click();
  await expect(page.getByRole("heading", { name: "Sobre el curs" })).toBeFocused();
  await axe("step 2");
  await expect(page.getByLabel(/^Motiu/)).toHaveCount(0); // hidden until Nivell II
  await page.getByLabel(/^Nivell/).selectOption("Nivell II");
  await expect(page.getByLabel(/^Motiu/)).toBeVisible();
  await page.getByLabel(/Accepto les condicions/).check();
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByText("Aquest camp és obligatori")).toBeVisible(); // the revealed field is required
  await axe("step 2 with error");
  await page.getByLabel(/^Nivell/).selectOption("Nivell I"); // hiding it removes the requirement
  await expect(page.getByLabel(/^Motiu/)).toHaveCount(0);
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByRole("status")).toContainText("Gràcies");
  const [s] = await sql`select answers from submissions where form_id = (select id from forms where slug = 'pas-a-pas')`;
  expect(s.answers.map((a: { label: string }) => a.label)).toEqual(["Nom", "Nivell"]); // the hidden field was not stored
});

test("spam defences: honeypot, missing/forged/replayed bot check, invalid data, closed form, rate limit", async ({ request }) => {
  const nom = F("text", { label: L("Nom"), required: "yes" });
  const id = await seedForm("antispam", [nom]);
  await seedForm("tancat", [nom], { active: false });
  const stored = () => count("submissions", sql`where form_id = ${id}`);
  const ok = { [nom.id]: "Ana" };

  // honeypot: looks like success to the bot, stores nothing
  const hp = await submitApi(request, "antispam", ok, { payload: { website: "http://spam.example" } });
  expect(hp.status()).toBe(200);
  expect(await stored()).toBe(0);

  // no bot check / forged bot check
  expect((await request.post("/api/forms/antispam/submit", { multipart: { payload: JSON.stringify({ locale: "ca", answers: ok, consent: true }) } })).status()).toBe(400);
  const ch = await (await request.get("/api/forms/antispam/challenge")).json();
  expect((await submitApi(request, "antispam", ok, { pow: { ...ch, number: solve(ch) + 1 } })).status()).toBe(400);
  expect((await submitApi(request, "antispam", ok, { pow: { salt: "a", challenge: "b", signature: "c", expires: Date.now() + 1e6, max: 1, number: 1 } })).status()).toBe(400);
  expect(await stored()).toBe(0);

  // a valid solution works once; replaying it is refused
  const good = { ...ch, number: solve(ch) };
  expect((await submitApi(request, "antispam", ok, { pow: good, xff: "198.51.100.7" })).status()).toBe(200);
  const again = await submitApi(request, "antispam", ok, { pow: good, xff: "198.51.100.7" });
  expect(again.status()).toBe(400);
  expect(await stored()).toBe(1);

  // invalid data: field-level errors, nothing stored
  const bad = await submitApi(request, "antispam", { [nom.id]: "" }, { xff: "198.51.100.8" });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).errors[nom.id]).toBeTruthy();
  expect(await stored()).toBe(1);

  // closed form: no challenge is issued, and a form closed after the visitor loaded it refuses the submission
  await sql`update forms set active = true where slug = 'tancat'`;
  const early = await (await request.get("/api/forms/tancat/challenge")).json();
  await sql`update forms set active = false where slug = 'tancat'`;
  expect((await request.get("/api/forms/tancat/challenge")).status()).toBe(404);
  expect((await submitApi(request, "tancat", ok, { pow: { ...early, number: solve(early) }, xff: "198.51.100.9" })).status()).toBe(410);

  // rate limit: 5 per address per form per 10 minutes; another address is unaffected
  for (let i = 0; i < 5; i++) expect((await submitApi(request, "antispam", ok, { xff: "203.0.113.50" })).status()).toBe(200);
  expect((await submitApi(request, "antispam", ok, { xff: "203.0.113.50" })).status()).toBe(429);
  expect((await submitApi(request, "antispam", ok, { xff: "203.0.113.51" })).status()).toBe(200);
});

test("uploads are private and identified by content; staff download through signed links; export and erasure", async ({ page, request }) => {
  const nom = F("text", { label: L("Nom"), required: "yes", map: "name" });
  const em = F("email", { label: L("Correu"), required: "yes", map: "email" });
  const cv = F("file", { label: L("CV") });
  const id = await seedForm("fitxers", [nom, em, cv], { destination: "crm_lead", consent: L("Accepto") });
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("contingut-secret-e2e")]);

  // disguised executable is refused
  const evil = await submitApi(request, "fitxers", { [nom.id]: "Eva", [em.id]: "eva@e2e.test" }, { files: { [cv.id]: { name: "cv.pdf", buffer: Buffer.from("MZ\x90\x00 malware") } }, xff: "198.51.100.20" });
  expect(evil.status()).toBe(422);
  expect(await count("submissions", sql`where form_id = ${id}`)).toBe(0);

  const r = await submitApi(request, "fitxers", { [nom.id]: "=HYPERLINK(\"http://evil\")", [em.id]: "eva@e2e.test" }, { files: { [cv.id]: { name: "cv.pdf", buffer: pdf } }, xff: "198.51.100.21" });
  expect(r.status()).toBe(200);
  const [sub] = await sql`select id, answers from submissions where form_id = ${id}`;
  const fileKey = sub.answers.find((a: { type: string }) => a.type === "file").value.key as string;
  expect((await fetch(`http://localhost:9090/apex-media/${fileKey}`)).status).toBe(404); // not in the public bucket

  // anonymous visitors cannot reach staff-only routes
  expect((await request.get(`/admin/forms/${id}/file?sub=${sub.id}&field=${cv.id}`, { maxRedirects: 0 })).status()).toBe(401);
  expect((await request.get(`/admin/forms/${id}/export`)).status()).toBe(401);

  await login(page);
  // signed link
  const dl = await page.request.get(`/admin/forms/${id}/file?sub=${sub.id}&field=${cv.id}`, { maxRedirects: 0 });
  expect(dl.status()).toBe(302);
  const signed = dl.headers().location;
  expect(signed).toContain("X-Amz-Signature");
  const fileRes = await fetch(signed);
  expect(fileRes.status).toBe(200);
  expect(fileRes.headers.get("content-disposition")).toContain("attachment");
  expect(Buffer.from(await fileRes.arrayBuffer()).toString()).toContain("contingut-secret-e2e");
  // a submission from another form cannot be reached through this form's URL
  const other = await seedForm("altre", [nom]);
  expect((await page.request.get(`/admin/forms/${other}/file?sub=${sub.id}&field=${cv.id}`, { maxRedirects: 0 })).status()).toBe(404);

  // spreadsheet export: BOM, header, and the formula is neutralised
  const csv = await page.request.get(`/admin/forms/${id}/export`);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const body = await csv.text();
  expect(body.charCodeAt(0)).toBe(0xfeff);
  expect(body).toContain("Nom;Correu;CV");
  expect(body).toContain("'=HYPERLINK");
  expect(body).toContain("cv.pdf");

  // responses screen shows the file link
  await page.goto(`/admin/forms/${id}/submissions`);
  await expect(page.getByRole("link", { name: "cv.pdf" })).toBeVisible();
  // the CRM side of a response (lead follow-up, conversion, erasure) is tested in apps/crm/e2e/leads.spec.ts
});

test("newsletter opt-in is its own box, unticked by default, stored separately from consent", async ({ page }) => {
  const em = F("email", { label: L("Correu"), required: "yes", map: "email" });
  await seedForm("butlleti", [em], { destination: "responses_only", consent: L("Accepto la privacitat"), newsletter: { enabled: true, text: L("Vull rebre el butlletí") } });
  await page.goto(WEB + "/ca/form/butlleti");
  const news = page.getByLabel("Vull rebre el butlletí");
  await expect(news).not.toBeChecked();
  await page.getByLabel(/^Correu/).fill("nl@e2e.test");
  await page.getByLabel(/Accepto la privacitat/).check();
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByRole("status")).toContainText("Gràcies");
  expect(await count("newsletter_optins", sql`where email = 'nl@e2e.test'`)).toBe(0); // consenting to privacy is not subscribing

  await page.goto(WEB + "/ca/form/butlleti");
  await page.getByLabel(/^Correu/).fill("nl2@e2e.test");
  await page.getByLabel(/Accepto la privacitat/).check();
  await page.getByLabel("Vull rebre el butlletí").check();
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByRole("status")).toContainText("Gràcies");
  const [o] = await sql`select * from newsletter_optins where email = 'nl2@e2e.test'`;
  expect(o.consent_text).toBe("Vull rebre el butlletí");
});

test("embeddable version, share link and browser security headers", async ({ page, request }) => {
  const nom = F("text", { label: L("Nom") });
  await seedForm("incrustat", [nom]);
  const embed = await request.get(WEB + "/embed/ca/form/incrustat");
  expect(embed.status()).toBe(200);
  expect(embed.headers()["content-security-policy"] ?? "").not.toContain("frame-ancestors"); // other sites may frame it
  expect(embed.headers()["x-frame-options"]).toBeUndefined();
  expect(await embed.text()).toContain('<html lang="ca"');

  expect((await request.get(WEB + "/ca")).headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
  const login = await request.get("/admin/login");
  expect(login.headers()["x-frame-options"]).toBe("DENY");
  expect(login.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect((await request.get("/api/forms/incrustat/challenge")).headers()["x-frame-options"]).toBe("DENY");
  expect(login.headers()["x-content-type-options"]).toBe("nosniff");

  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto(WEB + "/embed/es/form/incrustat");
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("Nom")).toBeVisible();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test("a form inside a landing page tags the lead with that page and its theme", async ({ page, request }) => {
  const nom = F("text", { label: L("Nom"), required: "yes", map: "name" });
  const em = F("email", { label: L("Correu"), required: "yes", map: "email" });
  const formId = await seedForm("dins-pagina", [nom, em], { destination: "crm_lead", consent: L("Accepto") });
  const sections = [{ id: "s1", type: "text", data: { body: "Apunta't a la jornada" } }, { id: "s2", type: "form", data: { formId } }];
  const live = { title: "Jornada", slug: "jornada-form", sections, seo: {}, publishedAt: new Date().toISOString() };
  const [e] = await sql`insert into entries (type, theme) values ('page', 'esdeveniments') returning id`;
  await sql`insert into entry_translations (entry_id, locale, title, slug, sections, status, live) values (${e.id}, 'ca', 'Jornada', 'jornada-form', ${sql.json(sections as never)}, 'published', ${sql.json(live as never)})`;
  await request.post(WEB + "/api/cron/revalidate", { headers: { authorization: "Bearer e2e-cron-secret-value" } }); // rows were written straight to the database

  await page.goto(WEB + "/ca/jornada-form");
  await page.getByLabel(/^Nom/).fill("Carla");
  await page.getByLabel(/^Correu/).fill("carla@e2e.test");
  await page.getByLabel("Accepto").check();
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByRole("status")).toContainText("Gràcies");
  await expect.poll(() => count("leads", sql`where source_path = '/ca/jornada-form'`)).toBe(1);
  const [lead] = await sql`select * from leads where source_path = '/ca/jornada-form'`;
  expect(lead).toMatchObject({ theme: "esdeveniments", locale: "ca", source_entry_id: e.id });
});

test("projects module: create a client and a project, point a form at it, and the response shows up on the project", async ({ page, request }) => {
  await loginCrm(page);
  await page.goto(CRM + "/workspace/companies?new=1"); // companies are created in the workspace; projects and portal access stay on the client page
  const sheet = page.getByRole("complementary", { name: "Fitxa" });
  await sheet.getByLabel("Nom", { exact: true }).fill("Rovellosa Packaging");
  await sheet.getByRole("button", { name: "Crea" }).click();
  await expect(page.getByRole("heading", { name: "Rovellosa Packaging" })).toBeVisible();
  await sheet.getByRole("link", { name: /Projectes i accés al portal/ }).click();
  await expect(page.getByRole("heading", { name: "Rovellosa Packaging" })).toBeVisible();

  await page.getByRole("link", { name: "Nou projecte" }).click();
  await page.waitForURL(/\/admin\/projects\?client=/);
  await expect(page.getByRole("heading", { name: "Nou projecte" })).toBeVisible(); // wait for the new page before typing
  await page.getByLabel("Nom").fill("Web corporativa");
  await page.getByRole("button", { name: "Crea el projecte" }).click();
  await expect(page.getByRole("heading", { name: "Web corporativa" })).toBeVisible();
  await expect(page.getByLabel("Client")).toHaveValue(/[0-9a-f-]{36}/); // came pre-filled from the client page
  const projectUrl = page.url();
  const projectId = projectUrl.split("/").pop()!.split("?")[0];

  // a form built in the admin with the "attach to a project" destination
  const nom = F("text", { label: L("Nom"), required: "yes" });
  const em = F("email", { label: L("Correu"), required: "yes" });
  const formId = await seedForm("brief-web", [nom, em], { destination: "project", consent: L("Accepto") });
  await sql`update forms set target_project_id = ${projectId} where id = ${formId}`;
  await login(page); // the builder is in the Forms app
  await page.goto(`/admin/forms/${formId}`);
  await expect(page.getByLabel("Adjunta les respostes a")).toHaveValue(`project:${projectId}`);
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Desat");

  const r = await submitApi(request, "brief-web", { [nom.id]: "Marta", [em.id]: "marta@e2e.test" }, { xff: "198.51.100.90" });
  expect(r.status()).toBe(200);
  expect(await count("contacts", sql`where email = 'marta@e2e.test'`)).toBe(0); // attach-only: no CRM contact

  await page.goto(projectUrl);
  await expect(page.getByText("Nom: Marta")).toBeVisible();
  await page.goto(CRM + "/admin/projects");
  await expect(page.getByRole("row", { name: /Web corporativa/ })).toContainText("1");

  // an editor of the form must choose a target before saving
  await page.goto(`/admin/forms/${formId}`);
  await page.getByLabel("Adjunta les respostes a").selectOption("");
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Tria el projecte");
});

test("start from a template, open it, duplicate it from the editor and from the list", async ({ page }) => {
  await login(page);
  await page.goto("/admin/forms");
  await page.getByRole("button", { name: "Inscripció a un acte" }).click();
  await expect(page).toHaveURL(/\/admin\/forms\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Nom intern")).toHaveValue("Inscripció a un acte");
  await expect(page.getByLabel("Obert: accepta respostes")).not.toBeChecked(); // a template starts closed

  await page.getByLabel("Nom intern").fill("Jornada tardor");
  await page.getByLabel("Enllaç (slug)").fill("jornada-tardor");
  await page.getByLabel("Obert: accepta respostes").check();
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Desat");

  // a visitor can use it straight away: the template is a complete, valid form
  await page.goto(WEB + "/ca/form/jornada-tardor");
  await page.getByLabel(/^Nom i cognoms/).fill("Núria Soler");
  await page.getByLabel(/^Correu electrònic/).fill("nuria@e2e.test");
  await page.getByLabel(/^Nombre d'assistents/).fill("2");
  await page.getByLabel(/He llegit i accepto/).check();
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByRole("status")).toContainText("Gràcies");
  await expect.poll(() => count("contacts", sql`where email = 'nuria@e2e.test'`)).toBe(1);

  // duplicate from the editor: a closed copy with its own link
  await page.goto("/admin/forms");
  await page.getByRole("link", { name: "Jornada tardor", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/forms\/[0-9a-f-]{36}$/); // the editor, not the list (whose rows have their own Duplica buttons)
  await page.getByRole("button", { name: "Duplica el formulari", exact: true }).click();
  await expect(page.getByLabel("Nom intern")).toHaveValue("Jornada tardor (còpia)");
  await expect(page.getByLabel("Enllaç (slug)")).toHaveValue("jornada-tardor-copia");
  await expect(page.getByLabel("Obert: accepta respostes")).not.toBeChecked();

  // duplicate from the list: the next free link
  await page.goto("/admin/forms");
  await page.getByRole("button", { name: "Duplica el formulari Jornada tardor", exact: true }).click();
  await expect(page.getByLabel("Nom intern")).toHaveValue("Jornada tardor (còpia)");
  await expect(page.getByLabel("Enllaç (slug)")).toHaveValue("jornada-tardor-copia-2");
  expect(await count("submissions", sql`where form_id in (select id from forms where slug like 'jornada-tardor-copia%')`)).toBe(0); // responses are never copied
});

test("new field types: rating, yes/no, web address, address, title and paragraph work for a visitor and read well for staff", async ({ page }) => {
  const title = F("heading", { title: L("Les teves dades") });
  const intro = F("paragraph", { body: L("Omple-ho amb **calma**.") });
  const em = F("email", { label: L("Correu"), required: "yes" });
  const stars = F("rating", { label: L("Valoració"), required: "yes", max: "5", lowLabel: L("Gens"), highLabel: L("Molt") });
  const rec = F("yesno", { label: L("Ho recomanes?"), required: "yes" });
  const why = F("text", { label: L("Per què no?"), required: "yes", showField: rec.id, showOp: "equals", showValue: "no" });
  const web = F("url", { label: L("Web") });
  const addr = F("address", { label: L("Adreça"), required: "yes" });
  const id = await seedForm("tots-els-tipus", [title, intro, em, stars, rec, why, web, addr], { consent: L("Accepto") });

  await page.goto(WEB + "/ca/form/tots-els-tipus");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Les teves dades" })).toBeVisible();
  await expect(page.getByText("calma")).toBeVisible();
  await expect(page.getByText("1 = Gens · 5 = Molt")).toBeVisible();
  await expect(page.getByLabel(/^Per què no/)).toHaveCount(0); // hidden until the answer is No
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);

  // the server and the browser both refuse an empty or wrong answer, field by field
  await page.getByLabel(/Accepto/).check();
  await page.getByLabel("Web", { exact: true }).fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByText("Introdueix un enllaç web vàlid")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Aquest camp és obligatori" }).first()).toBeVisible();

  await page.getByLabel(/^Correu/).fill("laia@e2e.test");
  await page.getByRole("group", { name: /Valoració/ }).getByLabel("4", { exact: true }).check();
  await page.getByRole("group", { name: /Ho recomanes/ }).getByLabel("No", { exact: true }).check();
  await page.getByLabel(/^Per què no/).fill("Massa car");
  await page.getByLabel("Web", { exact: true }).fill("example.cat/pagina");
  const group = page.getByRole("group", { name: /Adreça/ });
  await group.getByLabel(/Carrer i número/).fill("Carrer Major 1");
  await group.getByLabel(/Codi postal/).fill("08001");
  await group.getByLabel(/Població/).fill("Barcelona");
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByRole("status")).toContainText("Gràcies");

  const [sub] = await sql`select answers from submissions where form_id = ${id}`;
  const by = Object.fromEntries(sub.answers.map((a: { label: string; value: unknown }) => [a.label, a.value]));
  expect(by["Valoració"]).toBe(4);
  expect(by["Ho recomanes?"]).toBe(false);
  expect(by["Web"]).toBe("https://example.cat/pagina");
  expect(by["Adreça"]).toEqual({ street: "Carrer Major 1", postalCode: "08001", city: "Barcelona" });
  expect(sub.answers.some((a: { type: string }) => a.type === "heading" || a.type === "paragraph")).toBe(false);

  // staff read plain text, never raw objects, on screen and in the spreadsheet
  await login(page);
  await page.goto(`/admin/forms/${id}/submissions`);
  await expect(page.getByText("Carrer Major 1, 08001 Barcelona")).toBeVisible();
  await expect(page.getByText("[object Object]")).toHaveCount(0);
  const csv = await (await page.request.get(`/admin/forms/${id}/export`)).text();
  expect(csv).toContain('"Carrer Major 1, 08001 Barcelona"');
  expect(csv).toMatch(/;4;No;Massa car;https:\/\/example\.cat\/pagina;/);
});

test("skip a step and combine conditions: the visitor only sees what applies, and the count of steps follows", async ({ page }) => {
  const who = F("dropdown", { label: L("Qui ets?"), required: "yes", options: [{ label: L("Particular") }, { label: L("Empresa") }] });
  const pbEmpresa = F("pagebreak", { title: L("Dades de l'empresa"), showField: who.id, showOp: "equals", showValue: "Empresa" });
  const cif = F("text", { label: L("CIF"), required: "yes" });
  const pbContact = F("pagebreak", { title: L("Contacte") });
  const em = F("email", { label: L("Correu"), required: "yes" });
  const gremi = F("text", { label: L("Número de soci"), showField: em.id, showOp: "contains", showValue: "gremi", showMatch: "any", showExtra: [{ field: cif.id, op: "not_empty", value: "" }] });
  const id = await seedForm("pas-condicional", [who, pbEmpresa, cif, pbContact, em, gremi]);

  await page.goto(WEB + "/ca/form/pas-condicional");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/^Qui ets/).selectOption("Particular");
  await expect(page.getByText("Pas 1 de 2")).toBeVisible(); // the company step is skipped, so it is not counted
  await expect(page.getByRole("progressbar", { name: "Pas 1 de 2" })).toBeVisible(); // the progress bar follows the steps that apply
  await page.getByRole("button", { name: "Següent" }).click();
  await expect(page.getByRole("heading", { name: "Contacte" })).toBeVisible();
  await expect(page.getByText("Pas 2 de 2")).toBeVisible();
  await expect(page.getByLabel(/^CIF/)).toHaveCount(0);

  // contains ignores case and accents; «any»: either condition shows the field
  await expect(page.getByLabel(/^Número de soci/)).toHaveCount(0);
  await page.getByLabel(/^Correu/).fill("maria@ALTRES.cat");
  await expect(page.getByLabel(/^Número de soci/)).toHaveCount(0);
  await page.getByLabel(/^Correu/).fill("maria@GREMI.cat");
  await expect(page.getByLabel(/^Número de soci/)).toBeVisible();

  // going back and choosing «Empresa» brings the step in, with its own required field
  await page.getByRole("button", { name: "Enrere" }).click();
  await page.getByLabel(/^Qui ets/).selectOption("Empresa");
  await expect(page.getByText("Pas 1 de 3")).toBeVisible();
  await page.getByRole("button", { name: "Següent" }).click();
  await expect(page.getByRole("heading", { name: "Dades de l'empresa" })).toBeVisible();
  await page.getByRole("button", { name: "Següent" }).click();
  await expect(page.getByText("Aquest camp és obligatori")).toBeVisible(); // the CIF of the shown step is enforced
  await page.getByLabel(/^CIF/).fill("B12345678");
  await page.getByRole("button", { name: "Següent" }).click();
  await expect(page.getByText("Pas 3 de 3")).toBeVisible();
  await page.getByLabel(/^Correu/).fill("empresa@altres.cat");
  await expect(page.getByLabel(/^Número de soci/)).toBeVisible(); // the CIF now fills the second condition
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByRole("status")).toContainText("Gràcies");

  const [sub] = await sql`select answers from submissions where form_id = ${id}`;
  expect(sub.answers.map((a: { label: string }) => a.label)).toEqual(["Qui ets?", "CIF", "Correu", "Número de soci"]); // the shown optional field is stored empty; nothing from a skipped step ever is
});

test("the editor offers more conditions, combining them and conditional steps, and what it saves works", async ({ page }) => {
  const nom = F("text", { label: L("Nom") });
  const em = F("email", { label: L("Correu") });
  const id = await seedForm("editor-condicions", [nom, em]);
  await login(page);
  await page.goto(`/admin/forms/${id}`);
  const card = (n: number) => page.locator(".col-main > .card").nth(n + 1); // card 0 is the name/slug card
  const chip = (t: string) => page.locator(".add button", { hasText: t }).first();

  await chip("Text curt").click();
  const f = card(2);
  await f.getByLabel("CA").first().fill("Número de soci");
  await f.getByLabel("Mostra només si… (un camp anterior)").selectOption({ label: "Nom" });
  await f.getByLabel("Condició").first().selectOption("contains");
  await f.getByLabel(/^Valor/).first().fill("gremi");
  await f.getByRole("button", { name: "+ Afegeix" }).click();
  const extra = f.locator(".nested .card").first();
  await extra.getByLabel("Camp anterior").selectOption({ label: "Correu" });
  await extra.getByLabel("Condició").selectOption("not_empty");
  await f.getByLabel("Si n'hi ha més d'una").selectOption("any");

  await chip("Salt de pàgina").click();
  const step = card(3);
  await step.getByLabel("CA").first().fill("Només amb correu");
  await step.getByLabel("Mostra aquest pas només si… (un camp d'un pas anterior)").selectOption({ label: "Correu" });
  await step.getByLabel("Condició").first().selectOption("not_empty");
  await expect(page.getByText("Salt de pàgina · pas condicional")).toBeVisible();
  await chip("Text curt").click();
  await card(4).getByLabel("CA").first().fill("Dins del pas");

  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Desat");

  const [row] = await sql`select fields from forms where id = ${id}`;
  const saved = row.fields[2].data;
  expect(saved).toMatchObject({ showField: nom.id, showOp: "contains", showValue: "gremi", showMatch: "any" });
  expect(saved.showExtra).toEqual([{ field: em.id, op: "not_empty", value: "" }]);
  expect(row.fields[3].data).toMatchObject({ showField: em.id, showOp: "not_empty" });

  // the saved form behaves as built: «any» shows the field from either condition
  await page.goto(WEB + "/ca/form/editor-condicions");
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel(/^Número de soci/)).toHaveCount(0);
  await page.getByLabel(/^Nom/).fill("Soci del GREMI");
  await expect(page.getByLabel(/^Número de soci/)).toBeVisible();
  await page.getByLabel(/^Nom/).fill("Altra persona");
  await expect(page.getByLabel(/^Número de soci/)).toHaveCount(0);
  await page.getByLabel(/^Correu/).fill("altra@persona.cat");
  await expect(page.getByLabel(/^Número de soci/)).toBeVisible();
});

test("availability: set an end date, a limit and a redirect in the editor; they are validated, saved and obeyed", async ({ page }) => {
  const em = F("email", { label: L("Correu"), required: "yes" });
  const id = await seedForm("disponibilitat", [em]);
  await login(page);
  await page.goto(`/admin/forms/${id}`);

  // refused with a clear message
  await page.getByLabel("Adreça on enviar la persona després d'enviar-lo").fill("javascript:alert(1)");
  await page.getByLabel("Màxim de respostes").fill("0");
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("L'adreça de redirecció ha de començar");
  await expect(page.getByRole("status")).toContainText("El màxim de respostes");

  // accepted: the date is typed in Catalonia's time and stored as the exact moment
  await page.getByLabel("Adreça on enviar la persona després d'enviar-lo").fill("/ca/gracies-e2e");
  await page.getByLabel("Màxim de respostes").fill("5");
  await page.getByLabel("Es tanca el (hora de Catalunya)").fill("2030-07-01T10:00");
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Desat");
  const [row] = await sql`select closes_at, max_responses, redirect_url from forms where id = ${id}`;
  expect(new Date(row.closes_at).toISOString()).toBe("2030-07-01T08:00:00.000Z");
  expect(row.max_responses).toBe(5);
  expect(row.redirect_url).toBe("/ca/gracies-e2e");
  await expect(page.getByLabel("Es tanca el (hora de Catalunya)")).toHaveValue("2030-07-01T10:00"); // and shown back as typed
  await expect(page.getByText("Actiu · 0 respostes")).toBeVisible();

  // obeyed: after a successful submission the visitor is sent to the page
  await page.goto(WEB + "/ca/form/disponibilitat");
  await page.getByLabel(/^Correu/).fill("redirigit@e2e.test");
  await page.getByRole("button", { name: "Envia" }).click();
  await page.waitForURL(WEB + "/ca/gracies-e2e");
  expect(await count("submissions", sql`where form_id = ${id}`)).toBe(1);
});

test("availability: once the limit is reached the public page shows the form as closed, and the API says so", async ({ page, request }) => {
  const em = F("email", { label: L("Correu"), required: "yes" });
  const id = await seedForm("places-limitades", [em]);
  await sql`update forms set max_responses = 1 where id = ${id}`;
  await page.goto(WEB + "/ca/form/places-limitades");
  await page.getByLabel(/^Correu/).fill("primera@e2e.test");
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByRole("status")).toContainText("Gràcies");

  // a page cached while there was room asks the Forms app when it opens, so anyone arriving later sees it closed
  await page.reload();
  await expect(page.getByText("Aquest formulari ja no accepta respostes.")).toBeVisible();
  await expect(page.getByLabel(/^Correu/)).toHaveCount(0);
  expect(await (await request.get("/api/forms/places-limitades/status")).json()).toEqual({ open: false });
  expect(await (await request.get("/api/forms/disponibilitat/status")).json()).toEqual({ open: true }); // the other form is still open
  expect(await (await request.get("/api/forms/no-existeix-gens/status")).json()).toEqual({ open: false });
  expect((await request.get("/api/forms/places-limitades/challenge")).status()).toBe(410);
  expect((await request.get("/api/forms/places-limitades/challenge")).headers()["x-frame-options"]).toBe("DENY");
  expect(await count("submissions", sql`where form_id = ${id}`)).toBe(1);
});

test("availability: a page cached before the end date shows the form as closed once the date has passed", async ({ page, request }) => {
  const em = F("email", { label: L("Correu"), required: "yes" });
  const id = await seedForm("fins-una-hora", [em]);
  await sql`update forms set closes_at = now() + interval '5 seconds' where id = ${id}`;
  await page.goto(WEB + "/ca/form/fins-una-hora");
  await expect(page.getByLabel(/^Correu/)).toBeVisible(); // open, and now cached
  await page.waitForTimeout(6000);
  await page.reload(); // the cached page still carries the form; the browser notices the date has passed
  await expect(page.getByText("Aquest formulari ja no accepta respostes.")).toBeVisible();
  await expect(page.getByLabel(/^Correu/)).toHaveCount(0);
  expect((await request.get("/api/forms/fins-una-hora/challenge")).status()).toBe(410);
  const forged = await submitApi(request, "fins-una-hora", { [em.id]: "tard@e2e.test" }).catch(() => null);
  expect(forged === null || forged.status() >= 400).toBe(true); // the server refuses it as well, whatever the browser does
  expect(await count("submissions", sql`where form_id = ${id}`)).toBe(0);
});

test("save and continue later: a private link, an email, restored answers and step, and the draft goes when the form is sent", async ({ page, context }) => {
  const nom = F("text", { label: L("Nom"), required: "yes" });
  const pb = F("pagebreak", { title: L("Detalls") });
  const notes = F("textarea", { label: L("Notes") });
  const id = await seedForm("curs-llarg", [nom, pb, notes]);
  await sql`update forms set allow_drafts = true, title = ${sql.json(L("Inscripció llarga") as never)} where id = ${id}`;
  await clearMail();

  await page.goto(WEB + "/ca/form/curs-llarg");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/^Nom/).fill("Núria Soler");
  await page.getByRole("button", { name: "Següent" }).click();
  await expect(page.getByRole("heading", { name: "Detalls" })).toBeVisible();
  await page.getByLabel(/^Notes/).fill("Escrit al segon pas");

  // save, and have the link mailed
  await page.getByRole("button", { name: "Desa i continua més tard" }).click();
  const panel = page.getByRole("group", { name: "Desa i continua més tard" });
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  await panel.getByLabel(/Correu per rebre l'enllaç/).fill("reprendre@e2e.test");
  await panel.getByRole("button", { name: "Desa l'esborrany" }).click();
  const link = await panel.getByLabel(/Esborrany desat/).inputValue();
  expect(link).toMatch(new RegExp(`^${WEB}/ca/form/curs-llarg\\?resume=[A-Za-z0-9_-]{43}$`));
  await expect(panel.getByText("T'hem enviat l'enllaç per correu.")).toBeVisible();
  const mail = await waitMail("reprendre@e2e.test");
  expect(mail.Subject).toBe("Continua el formulari «Inscripció llarga»");
  expect(mail.Text).toContain(link);

  // only the hash of the secret is stored, and the address is not kept
  const [d] = await sql`select token_hash, answers, step, email_hash from form_drafts where form_id = ${id}`;
  expect(link).not.toContain(d.token_hash);
  expect(d.step).toBe(1);
  expect(d.email_hash).not.toBeNull();
  expect(JSON.stringify(d)).not.toContain("reprendre@e2e.test");

  // saving again updates the same draft (not more than once a second)
  await page.getByLabel(/^Notes/).fill("Escrit al segon pas, i afegit després");
  await page.waitForTimeout(1200);
  await panel.getByRole("button", { name: "Desa l'esborrany" }).click();
  await expect(page.getByText("Esborrany actualitzat.")).toBeVisible();
  expect(await count("form_drafts", sql`where form_id = ${id}`)).toBe(1);

  // another visitor session opens the link: the answers and the step come back
  const again = await context.newPage();
  await again.goto(link);
  await expect(again.getByText("Hem recuperat el que havies escrit")).toBeVisible();
  await expect(again.getByRole("heading", { name: "Detalls" })).toBeVisible();
  await expect(again.getByLabel(/^Notes/)).toHaveValue("Escrit al segon pas, i afegit després");
  await again.getByRole("button", { name: "Enrere" }).click();
  await expect(again.getByLabel(/^Nom/)).toHaveValue("Núria Soler");
  await again.getByRole("button", { name: "Següent" }).click();
  await again.getByRole("button", { name: "Envia" }).click();
  await expect(again.getByRole("status").filter({ hasText: "Gràcies" })).toBeVisible();
  expect(await count("form_drafts", sql`where form_id = ${id}`)).toBe(0); // sending the form deletes the draft
  expect(await count("submissions", sql`where form_id = ${id}`)).toBe(1);
  const reuse = await context.newPage();
  await reuse.goto(link);
  await expect(reuse.getByText("No hem trobat aquest esborrany")).toBeVisible(); // the link no longer opens anything
  await expect(reuse.getByLabel(/^Nom/)).toBeVisible(); // and the form is still usable
});

test("save and continue later: a wrong or expired link, deleting your own draft, and forms that do not offer it", async ({ page, request }) => {
  const nom = F("text", { label: L("Nom"), required: "yes" });
  const id = await seedForm("esborrany-prova", [nom]);
  await sql`update forms set allow_drafts = true where id = ${id}`;

  await page.goto(WEB + "/ca/form/esborrany-prova");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/^Nom/).fill("Laia");
  await page.getByRole("button", { name: "Desa i continua més tard" }).click();
  await page.getByRole("button", { name: "Desa l'esborrany" }).click();
  const link = await page.getByLabel(/Esborrany desat/).inputValue();
  expect(await count("form_drafts", sql`where form_id = ${id}`)).toBe(1);

  // a tampered secret and an expired draft both say the same thing
  await page.goto(link.slice(0, -1) + (link.endsWith("A") ? "B" : "A"));
  await expect(page.getByText("No hem trobat aquest esborrany")).toBeVisible();
  await sql`update form_drafts set expires_at = now() - interval '1 minute' where form_id = ${id}`;
  await page.goto(link);
  await expect(page.getByText("No hem trobat aquest esborrany")).toBeVisible();
  await sql`update form_drafts set expires_at = now() + interval '1 day' where form_id = ${id}`;

  // the person can delete their own draft
  await page.goto(link);
  await expect(page.getByText("Hem recuperat el que havies escrit")).toBeVisible();
  await page.getByRole("button", { name: "Desa i continua més tard" }).click();
  await page.getByRole("button", { name: "Esborra l'esborrany" }).click();
  await expect(page.getByText("Esborrany esborrat.")).toBeVisible();
  expect(await count("form_drafts", sql`where form_id = ${id}`)).toBe(0);

  // a form that does not allow drafts offers nothing, and its API says not found
  await seedForm("sense-esborranys", [nom]);
  await page.goto(WEB + "/ca/form/sense-esborranys");
  await expect(page.getByLabel(/^Nom/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Desa i continua més tard" })).toHaveCount(0);
  expect((await request.post("/api/forms/sense-esborranys/draft", { data: { answers: {}, step: 0, locale: "ca" } })).status()).toBe(404);
  expect((await request.post("/api/forms/sense-esborranys/draft/load", { data: { token: "A".repeat(43) } })).status()).toBe(404);

  // the API refuses a save without the bot check, and a draft of a form that closed
  expect((await request.post("/api/forms/esborrany-prova/draft", { data: { answers: {}, step: 0, locale: "ca" } })).status()).toBe(400);
  await sql`update forms set max_responses = 1 where id = ${id}`;
  await sql`insert into submissions (form_id, answers, locale) values (${id}, '[]'::jsonb, 'ca')`;
  expect((await request.post("/api/forms/esborrany-prova/draft", { data: { answers: {}, step: 0, locale: "ca" } })).status()).toBe(410);
});

test("the editor can switch drafts on, and shows how many are waiting", async ({ page }) => {
  const nom = F("text", { label: L("Nom") });
  const id = await seedForm("editor-esborranys", [nom]);
  await login(page);
  await page.goto(`/admin/forms/${id}`);
  await expect(page.getByText("Esborranys pendents")).toHaveCount(0);
  await page.getByLabel("Permet desar i continuar més tard").check();
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Desat");
  expect((await sql`select allow_drafts from forms where id = ${id}`)[0].allow_drafts).toBe(true);
  await expect(page.getByText("Esborranys pendents")).toBeVisible();
});

test("edit a sent response with a private link: shown once, mailed, email locked, original kept, staff told", async ({ page, context, request }) => {
  const nom = F("text", { label: L("Nom"), required: "yes", map: "name" });
  const em = F("email", { label: L("Correu"), required: "yes", map: "email" });
  const notes = F("textarea", { label: L("Notes") });
  const staff = "equip-edicions@e2e.test", visitor = "edita@e2e.test";
  const id = await seedForm("edita-resposta", [nom, em, notes], { destination: "crm_lead", notifications: { staffEmail: true, staffAddresses: staff, confirmToSender: true }, redirectUrl: "" });
  await sql`update forms set allow_edits = true, redirect_url = '/ca/gracies-no-ha-de-sortir' where id = ${id}`;
  await clearMail();

  await page.goto(WEB + "/ca/form/edita-resposta");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/^Nom/).fill("Berta Vila");
  await page.getByLabel(/^Correu/).fill(visitor);
  await page.getByLabel(/^Notes/).fill("Primera versió");
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByRole("status")).toContainText("Gràcies");
  // with edits on, the thank-you screen shows the link instead of redirecting (it would be lost)
  expect(page.url()).toBe(WEB + "/ca/form/edita-resposta");
  const link = await page.getByLabel("Enllaç per modificar la resposta").inputValue();
  expect(link).toMatch(new RegExp(`^${WEB}/ca/form/edita-resposta\\?edit=[A-Za-z0-9_-]{43}$`));
  await expect(page.getByText(/Pots modificar la teva resposta fins al/)).toBeVisible();
  const mail = await waitMail(visitor);
  expect(mail.Text).toContain(link);

  // opening the link: filled in, the email frozen, a clear button
  const edit = await context.newPage();
  await edit.goto(link);
  await expect(edit.getByText(/Estàs modificant la resposta que vas enviar el/)).toBeVisible();
  await expect(edit.getByLabel(/^Nom/)).toHaveValue("Berta Vila");
  await expect(edit.getByLabel(/^Notes/)).toHaveValue("Primera versió");
  await expect(edit.getByLabel(/^Correu/)).toBeDisabled();
  await expect(edit.getByText("Aquest camp no es pot canviar des d'aquí.")).toBeVisible();
  const axe = await new AxeBuilder({ page: edit }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  await edit.getByLabel(/^Nom/).fill("");
  await edit.getByRole("button", { name: "Desa els canvis" }).click();
  await expect(edit.getByText("Aquest camp és obligatori")).toBeVisible(); // validated like the first time
  await edit.getByLabel(/^Nom/).fill("Berta Vila Roca");
  await edit.getByLabel(/^Notes/).fill("Versió corregida");
  await edit.getByRole("button", { name: "Desa els canvis" }).click();
  await expect(edit.getByRole("status")).toContainText("Canvis desats");

  const [sub] = await sql`select answers, original_answers, edit_count from submissions where form_id = ${id}`;
  const val = (list: { label: string; value: unknown }[], label: string) => list.find((a) => a.label === label)?.value;
  expect(val(sub.answers, "Notes")).toBe("Versió corregida");
  expect(val(sub.answers, "Correu")).toBe(visitor); // unchanged
  expect(val(sub.original_answers, "Notes")).toBe("Primera versió");
  expect(sub.edit_count).toBe(1);
  expect((await sql`select name from contacts where email = ${visitor}`)[0].name).toBe("Berta Vila Roca");

  // the staff are told what changed, and see the original
  let note = "";
  for (let i = 0; i < 40 && !note; i++) {
    const r = await (await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:${staff} subject:"Resposta modificada"`)}`)).json();
    if (r.messages?.length) note = (await (await fetch(`${MAILPIT}/message/${r.messages[0].ID}`)).json()).Text;
    else await new Promise((res) => setTimeout(res, 250));
  }
  expect(note).toContain("Notes: Primera versió → Versió corregida");
  await login(page);
  await page.goto(`/admin/forms/${id}/submissions`);
  await expect(page.getByText("Modificada 1 cop")).toBeVisible();
  await page.getByText("Veure la resposta original").click();
  await expect(page.getByText("Primera versió")).toBeVisible();

  // a wrong secret, an expired window and a form that stopped offering it all look the same
  const wrong = await context.newPage();
  await wrong.goto(link.slice(0, -1) + (link.endsWith("A") ? "B" : "A"));
  await expect(wrong.getByText("No hem trobat aquesta resposta o ja no es pot modificar.")).toBeVisible();
  const token = link.split("edit=")[1];
  const load = () => request.post("/api/forms/edita-resposta/response/load", { data: { token } });
  expect((await load()).status()).toBe(200);
  await sql`update submissions set created_at = now() - interval '31 days' where form_id = ${id}`;
  expect((await load()).status()).toBe(404);
  await sql`update submissions set created_at = now() where form_id = ${id}`;
  await sql`update forms set allow_edits = false where id = ${id}`;
  expect((await load()).status()).toBe(404);
  expect((await request.post("/api/forms/edita-resposta/response/update", { data: { token, answers: {}, locale: "ca" } })).status()).toBe(404);
});

test("a form that does not allow edits gives no link, and the editor can switch edits on", async ({ page }) => {
  const nom = F("text", { label: L("Nom"), required: "yes" });
  const id = await seedForm("sense-edicions", [nom]);
  await page.goto(WEB + "/ca/form/sense-edicions");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/^Nom/).fill("Pau");
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByRole("status")).toContainText("Gràcies");
  await expect(page.getByLabel("Enllaç per modificar la resposta")).toHaveCount(0);
  expect((await sql`select edit_token_hash from submissions where form_id = ${id}`)[0].edit_token_hash).toBeNull();

  await login(page);
  await page.goto(`/admin/forms/${id}`);
  await page.getByLabel("Permet modificar la resposta enviada").check();
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Desat");
  expect((await sql`select allow_edits from forms where id = ${id}`)[0].allow_edits).toBe(true);
});

test("webhooks: add an endpoint, a response reaches it signed, failures are retried and shown, staff can test, disable and delete", async ({ page }) => {
  // a receiver on this machine
  const got: { headers: http.IncomingHttpHeaders; body: string }[] = [];
  let answer = 200;
  const server = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { got.push({ headers: req.headers, body: b }); res.statusCode = answer; res.end(answer === 200 ? "ok" : "receiver says no"); }); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  try {
    const nom = F("text", { label: L("Nom"), required: "yes" });
    const cv = F("file", { label: L("CV") });
    const id = await seedForm("amb-webhook", [nom, cv]);
    await login(page);
    await page.goto(`/admin/forms/${id}/integrations`);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);

    // an address that is not allowed is refused with a reason
    for (const bad of ["ftp://exemple.cat/x", "javascript:alert(1)", "exemple.cat/hook"]) {
      await page.getByLabel("Adreça de l'endpoint").fill(bad);
      await page.getByRole("button", { name: "Afegeix l'endpoint" }).click();
      await expect(page.getByRole("alert").filter({ hasText: /L'adreça/ })).toBeVisible();
    }
    await page.getByLabel("Adreça de l'endpoint").fill(url);
    await page.getByRole("button", { name: "Afegeix l'endpoint" }).click();
    await expect(page.getByRole("status")).toContainText("Endpoint afegit");
    const [hook] = await sql`select id, secret from form_webhooks where form_id = ${id}`;
    expect(hook.secret).toMatch(/^whsec_/);
    await page.getByText("Veure el secret per signar").click();
    await expect(page.getByText(hook.secret)).toBeVisible();

    // a response reaches the endpoint, signed, with the files left out
    const send = async (who: string) => {
      await page.goto(WEB + "/ca/form/amb-webhook");
      await page.waitForLoadState("networkidle");
      await page.getByLabel(/^Nom/).fill(who);
      await page.getByRole("button", { name: "Envia" }).click();
      await expect(page.getByRole("status")).toContainText("Gràcies");
    };
    await send("Marta Ros");
    await expect.poll(() => got.length, { timeout: 15_000 }).toBe(1);
    const first = got[0];
    expect(first.headers["x-apex-event"]).toBe("response.created");
    const [t, v1] = String(first.headers["x-apex-signature"]).split(",").map((p) => p.split("=")[1]);
    expect(createHmac("sha256", hook.secret).update(`${t}.${first.body}`).digest("hex")).toBe(v1);
    const payload = JSON.parse(first.body);
    expect(payload).toMatchObject({ event: "response.created", form: { slug: "amb-webhook" }, response: { locale: "ca" } });
    expect(payload.response.answers.map((a: { label: string; text: string }) => `${a.label}=${a.text}`)).toContain("Nom=Marta Ros");
    expect(payload.delivery).toBe(first.headers["x-apex-delivery"]);

    await page.goto(`/admin/forms/${id}/integrations`);
    await expect(page.getByRole("row", { name: /response\.created/ })).toContainText("Enviat");
    await expect(page.getByRole("row", { name: /response\.created/ })).toContainText("HTTP 200");

    // a failing endpoint: the attempt is kept as pending with the reason, then retried by hand once it works
    answer = 500;
    await send("Pere Soler");
    await expect.poll(() => got.length, { timeout: 15_000 }).toBe(2);
    await page.goto(`/admin/forms/${id}/integrations`);
    const failing = page.getByRole("row", { name: /Pendent/ });
    await expect(failing).toContainText("500");
    await expect(failing).toContainText("receiver says no");
    answer = 200;
    await failing.getByRole("button", { name: "Torna-ho a provar" }).click();
    await expect(page.getByRole("status")).toContainText("Reintent fet");
    expect(got.length).toBe(3);
    expect(got[2].headers["x-apex-delivery"]).toBe(got[1].headers["x-apex-delivery"]); // the same delivery id on the retry, so the receiver can ignore duplicates
    await expect(page.getByRole("row", { name: /Pendent/ })).toHaveCount(0);

    // a test event
    await page.getByRole("button", { name: /Envia una prova/ }).click();
    await expect(page.getByRole("status")).toContainText("Prova enviada");
    expect(got[got.length - 1].headers["x-apex-event"]).toBe("ping");
    expect(JSON.parse(got[got.length - 1].body)).toMatchObject({ event: "ping", response: null });

    // disabled endpoints are not told; deleting one removes its history
    await page.getByRole("button", { name: /^Desactiva/ }).click();
    await expect(page.getByText("Desactivat")).toBeVisible();
    const before = got.length;
    await send("Cap avís");
    await page.waitForTimeout(1500);
    expect(got.length).toBe(before);
    expect(await count("webhook_deliveries", sql`where webhook_id = ${hook.id} and payload::text like '%Cap av%'`)).toBe(0);
    await page.goto(`/admin/forms/${id}/integrations`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Elimina" }).click();
    await expect(page.getByRole("status")).toContainText("Endpoint eliminat");
    expect(await count("webhook_deliveries", sql`where webhook_id = ${hook.id}`)).toBe(0);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("records destination: a registration form signs people up to an event in the CRM, failures are visible, and retrying works", async ({ page, request }) => {
  const nom = F("text", { label: L("Nom"), required: "yes" });
  const em = F("email", { label: L("Correu"), required: "yes" });
  const empresa = F("text", { label: L("Empresa") });
  const id = await seedForm("inscripcio-gala", [nom, em, empresa], { consent: L("Accepto") });
  const [ev] = await sql`insert into events (name, starts_on) values ('Gala e2e', '2026-11-20') returning id`;
  await login(page);

  const open = async () => {
    await page.goto(`/admin/forms/${id}`);
    await page.getByLabel("Crear registres al CRM (inscripció a un esdeveniment, persona, cas…)").check();
    await page.getByLabel("Què es crea al CRM amb cada resposta").selectOption({ label: "Inscripció a un esdeveniment" });
    return page.locator("fieldset", { hasText: "Destinació de les respostes" });
  };

  // an incomplete setup is refused, naming what is missing
  await open();
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("«Esdeveniment»: cal triar-ne un");
  await expect(page.getByRole("status")).toContainText("«Nom»: tria quin camp");
  await expect(page.getByRole("status")).toContainText("«Correu»: tria quin camp");

  // a complete one is saved
  const panel = await open();
  await panel.getByLabel(/^Esdeveniment \*/).selectOption({ label: "Gala e2e · 2026-11-20" });
  await panel.getByLabel(/^Nom \*/).selectOption({ label: "Nom" });
  await panel.getByLabel(/^Correu \*/).selectOption({ label: "Correu" });
  await panel.getByLabel(/^Empresa \(pel nom/).selectOption({ label: "Empresa" });
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Desat");
  const [saved] = await sql`select destination, routing from forms where id = ${id}`;
  expect(saved.destination).toBe("records");
  expect(saved.routing).toEqual({ target: "attendance", map: { name: nom.id, email: em.id, company: empresa.id }, fixed: { eventId: ev.id } });

  const register = async (who: string, address: string) => {
    await page.goto(WEB + "/ca/form/inscripcio-gala");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/^Nom/).fill(who);
    await page.getByLabel(/^Correu/).fill(address);
    await page.getByLabel(/^Empresa/).fill("Gràfiques e2e");
    await page.getByLabel("Accepto").check();
    await page.getByRole("button", { name: "Envia" }).click();
    await expect(page.getByRole("status")).toContainText("Gràcies");
  };
  const tick = async () => {
    const r = await request.post(CRM + "/api/cron/tick", { headers: { authorization: "Bearer e2e-cron-secret-value" } });
    expect(r.status()).toBe(200);
    return (await r.json()).routed as { done: number; failed: number };
  };

  // the response waits for the CRM, which then creates the person and the registration through its own records engine
  await register("Marta Ros", "marta.gala@e2e.test");
  await page.goto(`/admin/forms/${id}/submissions`);
  await expect(page.getByText("El CRM encara no n'ha creat els registres")).toBeVisible();
  expect(await count("people", sql`where email = 'marta.gala@e2e.test'`)).toBe(0); // the Forms app never writes CRM tables itself
  expect((await tick()).done).toBeGreaterThanOrEqual(1);
  await page.reload();
  await expect(page.getByText("Passat al CRM")).toBeVisible();
  await expect(page.getByText("Persona: Marta Ros (creat)")).toBeVisible();
  await expect(page.getByText("Inscripció: Gala e2e (creat)")).toBeVisible();
  const [person] = await sql`select id, name, source from people where email = 'marta.gala@e2e.test'`;
  expect(person).toMatchObject({ name: "Marta Ros" });
  expect(person.source).toContain("Formulari:");
  expect(await count("event_attendance", sql`where event_id = ${ev.id} and person_id = ${person.id} and status = 'confirmed'`)).toBe(1);
  const [hist] = await sql`select action, user_name from record_history where entity = 'people' and record_id = ${person.id}`;
  expect(hist.action).toBe("create");
  expect(hist.user_name).toContain("Formulari");

  // the same person registering again changes nothing
  await register("Marta Ros", "marta.gala@e2e.test");
  await tick();
  expect(await count("event_attendance", sql`where event_id = ${ev.id}`)).toBe(1);

  // the event disappears: the response fails with a reason, the list warns, and staff can retry once it is fixed
  await sql`delete from events where id = ${ev.id}`;
  await register("Pere Soler", "pere.gala@e2e.test");
  expect((await tick()).failed).toBeGreaterThanOrEqual(1);
  await page.goto(`/admin/forms/${id}/submissions`);
  await expect(page.getByRole("alert").filter({ hasText: "No s'ha pogut passar al CRM" })).toContainText("esdeveniment triat ja no existeix");
  await page.goto("/admin/forms");
  await expect(page.getByRole("alert").filter({ hasText: "no s'han pogut passar al CRM" })).toBeVisible();
  const [ev2] = await sql`insert into events (name, starts_on) values ('Gala e2e 2', '2026-12-05') returning id`;
  await sql`update forms set routing = jsonb_set(routing, '{fixed,eventId}', to_jsonb(${ev2.id}::text)) where id = ${id}`;
  await page.goto(`/admin/forms/${id}/submissions`);
  await page.getByRole("button", { name: "Torna-ho a provar" }).click();
  await expect(page.getByRole("status")).toContainText("Es tornarà a provar al CRM");
  expect((await tick()).done).toBeGreaterThanOrEqual(1);
  await page.goto(`/admin/forms/${id}/submissions`);
  await expect(page.getByText("Inscripció: Gala e2e 2 (creat)")).toBeVisible();
  expect(await count("event_attendance", sql`where event_id = ${ev2.id}`)).toBe(1);
});

test("calculated fields: build one in the editor, the visitor sees the total live, the server stores its own result, staff read it", async ({ page }) => {
  const qty = F("number", { label: L("Entrades"), required: "yes" });
  const level = F("dropdown", { label: L("Nivell"), options: [{ label: L("Bàsic"), points: "1" }, { label: L("Premium"), points: "4" }] });
  const id = await seedForm("calcul-e2e", [qty, level], { consent: L("Accepto") });
  await login(page);
  await page.goto(`/admin/forms/${id}`);
  const card = (n: number) => page.locator(".col-main > .card").nth(n + 1);

  // the builder: a total of both questions, the second counting double, shown to the visitor
  await page.locator(".add button", { hasText: "Resultat calculat" }).first().click();
  const c = card(2);
  await c.getByLabel("CA").first().fill("Total de punts");
  await c.getByLabel("Qui ho veu").selectOption("yes");
  await c.getByRole("button", { name: "+ Afegeix" }).click();
  await c.locator(".nested .card").nth(0).getByLabel("Pregunta anterior").selectOption({ label: "Entrades" });
  await c.getByRole("button", { name: "+ Afegeix" }).click();
  const second = c.locator(".nested .card").nth(1);
  await second.getByLabel("Pregunta anterior").selectOption({ label: "Nivell" });
  await second.getByLabel(/^Pes/).fill("2");
  await c.getByLabel(/^Sumar-hi un número fix/).fill("1");
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Desat");
  const [row] = await sql`select fields from forms where id = ${id}`;
  expect(row.fields[2].data).toMatchObject({ op: "sum", show: "yes", offset: "1", terms: [{ field: qty.id, weight: "" }, { field: level.id, weight: "2" }] });

  // an unfinished one is refused, saying why
  await page.locator(".add button", { hasText: "Resultat calculat" }).first().click();
  await card(3).getByLabel("CA").first().fill("Buit");
  await page.getByRole("button", { name: "Desa", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("tria almenys una pregunta que compti");
  await page.goto(`/admin/forms/${id}`); // leave the unsaved one behind

  // the visitor: the total follows the answers
  await page.goto(WEB + "/ca/form/calcul-e2e");
  await page.waitForLoadState("networkidle");
  const out = page.locator("output");
  await expect(out).toHaveText("1"); // nothing answered: the sum starts from the fixed number
  await page.getByLabel(/^Entrades/).fill("3");
  await page.getByLabel(/^Nivell/).selectOption("Premium");
  await expect(out).toHaveText("12"); // 3 + 4*2 + 1
  await page.getByLabel(/^Nivell/).selectOption("Bàsic");
  await expect(out).toHaveText("6");
  await page.getByLabel("Accepto").check();
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByRole("status")).toContainText("Gràcies");

  const [sub] = await sql`select answers from submissions where form_id = ${id}`;
  expect(sub.answers.find((a: { type: string }) => a.type === "calculated")).toMatchObject({ label: "Total de punts", value: 6 });
  await page.goto(`/admin/forms/${id}/submissions`);
  await expect(page.getByText("Total de punts")).toBeVisible();
  const csv = await (await page.request.get(`/admin/forms/${id}/export`)).text();
  expect(csv).toContain("Total de punts");
});

test("analytics: drop-off per question, time to complete and a chart per choice question, all anonymous", async ({ page }) => {
  const nom = F("text", { label: L("Nom"), required: "yes" });
  const lvl = F("dropdown", { label: L("Nivell"), options: [{ label: L("Bàsic") }, { label: L("Premium") }] });
  const web = F("text", { label: L("Comentari") });
  const id = await seedForm("estadistiques-e2e", [nom, lvl, web], { consent: L("Accepto") });

  // visitor 1 gives up after the first question; visitor 2 goes all the way
  await page.goto(WEB + "/ca/form/estadistiques-e2e");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/^Nom/).fill("Abandona");
  await page.goto(WEB + "/ca/form/estadistiques-e2e");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/^Nom/).fill("Anna");
  await page.getByLabel(/^Nivell/).focus(); // a person's hand reaches the question first (selectOption alone does not focus it)
  await page.getByLabel(/^Nivell/).selectOption("Premium");
  await page.getByLabel(/^Comentari/).fill("Hola");
  await page.getByLabel("Accepto").check();
  await page.getByRole("button", { name: "Envia" }).click();
  await expect(page.getByRole("status")).toContainText("Gràcies");

  // only totals per question are kept: no row says who, when or from where
  await expect.poll(async () => JSON.stringify((await sql`select n from form_field_reach where form_id = ${id} order by n desc`).map((r) => r.n))).toBe("[2,1,1]");
  const reach = Object.fromEntries((await sql`select field_id, n from form_field_reach where form_id = ${id}`).map((r) => [r.field_id as string, r.n as number]));
  expect(reach[nom.id]).toBe(2);
  expect(reach[lvl.id]).toBe(1);
  const [sub] = await sql`select duration_seconds from submissions where form_id = ${id}`;
  expect(sub.duration_seconds).toBeGreaterThanOrEqual(0);
  expect(sub.duration_seconds).toBeLessThan(120);

  // a request for a question that does not exist, or for a form that does not exist, stores nothing
  const bad = await page.request.post(WEB + "/api/forms/estadistiques-e2e/reach", { data: { field: "no-existeix" } });
  expect(bad.status()).toBe(204);
  expect((await sql`select 1 from form_field_reach where form_id = ${id}`).length).toBe(3);

  await login(page);
  await page.goto(`/admin/forms/${id}/analytics`);
  await expect(page.getByRole("heading", { name: "Estadístiques" })).toBeVisible();
  await expect(page.getByText("han començat a omplir-lo")).toBeVisible();
  await expect(page.getByText(/hi arriben · .* dels inicis · −50 % respecte l'anterior/)).toBeVisible(); // 2 reached Nom, 1 reached Nivell
  await expect(page.getByRole("heading", { name: "Nivell" })).toBeVisible();
  await expect(page.locator(".card", { hasText: "Premium" }).getByText("1 · 100 %")).toBeVisible();
  await page.goto(`/admin/forms/${id}`);
  await page.getByRole("link", { name: "Estadístiques" }).click();
  await expect(page).toHaveURL(/\/analytics$/);
});
