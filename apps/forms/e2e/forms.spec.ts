// Form builder + lead pipeline, end to end: real browser, real production build, real database, real SMTP (Mailpit) and S3 mock.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
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
