// Design foundation checks: every public page, at phone/tablet/desktop widths, must have no accessibility
// violations (WCAG 2.2 AA via axe), no sideways scrolling, and comfortable touch targets on small screens.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { CRON_SECRET, E2E_DB } from "../playwright.config";

const WIDTHS = [320, 375, 768, 1024, 1440];
const sec = (type: string, data: Record<string, unknown>) => ({ id: crypto.randomUUID(), type, data });

let PAGES: string[] = [];

test.beforeAll(async ({ request }) => {
  const sql = postgres(E2E_DB, { max: 1 });
  await sql`delete from entries`; await sql`delete from categories`; // safe to re-run (Playwright re-runs this after a worker restart)
  const live = (title: string, slug: string, sections: unknown[], seo = {}) => ({ title, slug, sections, seo, publishedAt: new Date().toISOString() });
  const [cat] = await sql`insert into categories (slug, names) values ('empresa', ${sql.json({ ca: "Empresa", es: "Empresa", en: "Business" })}) returning id`;
  const addEntry = async (type: "post" | "page", l: ReturnType<typeof live>, over: { on?: string; cat?: string } = {}) => {
    const [e] = await sql`insert into entries (type, category_id, published_on) values (${type}, ${over.cat ?? null}, ${over.on ?? null}) returning id`;
    await sql`insert into entry_translations (entry_id, locale, title, slug, sections, seo, status, live)
      values (${e.id}, 'ca', ${l.title}, ${l.slug}, ${sql.json(l.sections as never)}, ${sql.json({})}, 'published', ${sql.json(l as never)})`;
    return e.id as string;
  };
  for (const [i, t] of ["El sector visita una nova planta de packaging", "Publicat el nou conveni col·lectiu del sector", "Com impacta la intel·ligència artificial al sector"].entries())
    await addEntry("post", live(t, `article-${i + 1}`, [sec("text", { body: "Cos de l'article amb **negreta** i un [enllaç](/ca/blog).\n\n- Un\n- Dos" }), sec("embed", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })]), { on: `2026-09-2${8 - i}`, cat: cat.id });

  const showcase = [
    sec("header", { eyebrow: "Des del 1491", linkLabel: "Fes-te sòcia", linkUrl: "/ca/blog", link2Label: "Més informació", link2Url: "/ca/blog", title: "Donant forma al futur de la indústria gràfica", subtitle: "Formació, representació i comunitat per als professionals del sector gràfic a Catalunya.", image: "" }),
    sec("tileRow", { tiles: [{ label: "Innovació", text: "Les últimes tendències." }, { label: "Comunitat", text: "El punt de trobada." }, { label: "Tradició", text: "Des de 1491." }, { label: "Promoció", text: "Visibilitzant el sector." }] }),
    sec("latestPosts", { heading: "Actualitat del sector", count: "3" }),
    sec("text", { body: "Un paràgraf amb **negreta**, *cursiva* i un [enllaç](/ca/blog)." }),
    sec("cardGrid", { heading: "Cursos, seminaris i jornades", cards: [
      { label: "Curs", title: "Plegat i engomat: preparació i execució", text: "16–27 setembre", image: "", linkUrl: "/ca/blog" },
      { label: "Jornada", title: "Nova normativa europea sobre envasos", text: "15 octubre", image: "", linkUrl: "" },
      { label: "Webinar", title: "Com gestionar correctament els teus residus", text: "22 octubre", image: "", linkUrl: "" },
      { label: "Acte", title: "Tour guiat a la fira internacional", text: "4 novembre", image: "", linkUrl: "" }] }),
    sec("cta", { heading: "Fes-te sòcia", text: "Uneix-te al gremi.", linkLabel: "Més informació", linkUrl: "/ca/blog" }),
  ];
  const home = await addEntry("page", live("Inici", "inici", showcase));
  await addEntry("page", live("Formació", "formacio", showcase.slice(3)));
  // Visual builder: columns with every block type, in each brand background.
  const blk = (type: string, data: Record<string, unknown>) => ({ id: crypto.randomUUID(), type, data });
  const colsSec = (bg: string, layout: string, align = "left") => ({ ...sec("columns", { heading: `Fons ${bg}`, layout,
    c1: [blk("heading", { text: "Un títol gran", size: "l" }), blk("text", { body: "Text amb **negreta** i un [enllaç](/ca/blog).\n\n- Un\n- Dos" }), blk("button", { label: "Inscriu-t'hi", url: "/ca/blog", variant: "primary" })],
    c2: [blk("heading", { text: "Un títol petit", size: "s" }), blk("button", { label: "Més informació", url: "/ca/blog", variant: "outline" }), blk("card", { label: "Curs", title: "Plegat i engomat", text: "16 setembre", image: "", linkUrl: "/ca/blog" })],
    c3: [blk("embed", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })],
    c4: [blk("heading", { text: "Destacat", size: "xl", color: "accent" }), blk("divider", { look: "accent" }), blk("text", { body: "Quarta columna.", size: "l" }), blk("spacer", { size: "s" }),
      blk("button", { label: "Gran", url: "/ca/blog", variant: "dark", size: "l" }), blk("divider", { look: "line" }), blk("text", { body: "Nota petita.", size: "s" }),
      blk("card", { label: "Ombra", title: "Targeta", text: "Amb ombra", image: "", linkUrl: "", look: "shadow" })] }), style: { bg, space: "m", align, width: "narrow", valign: "center" } });
  await addEntry("page", live("Constructor", "constructor", [
    colsSec("auto", "2-1"), colsSec("beige", "1-1-1"), colsSec("dark", "1-1-1-1", "center"), colsSec("red", "1-2"), colsSec("white", "1"),
    { ...sec("cta", { heading: "Fes-te sòcia", text: "Uneix-te al gremi.", linkLabel: "Més informació", linkUrl: "/ca/blog" }), style: { bg: "red", space: "l", align: "left" } },
  ]));
  const L3 = (ca: string) => ({ ca, es: ca, en: ca });
  const settings = {
    homepage: home, phone: "+34 93 000 00 00", email: "info@apex.example",
    headerButtons: [{ label: L3("Campus virtual"), url: "https://campus.example", style: "primary" }, { label: L3("Contacte"), url: "/ca/formacio", style: "outline" }],
    social: [{ network: "facebook", url: "https://www.facebook.com/" }, { network: "instagram", url: "https://www.instagram.com/" }, { network: "youtube", url: "https://www.youtube.com/" }],
    nav: [
      { label: L3("El GREMI"), url: "", children: [{ label: L3("Nosaltres"), url: "/ca/formacio" }, { label: L3("Serveis del GREMI"), url: "/ca/blog" }] },
      { label: L3("Formació"), url: "/ca/formacio", children: [] },
      { label: L3("Actualitat"), url: "", children: [{ label: L3("Notícies"), url: "/ca/blog" }, { label: L3("Revista"), url: "/ca/formacio" }] },
    ],
    footerText: L3("Representant i donant suport als professionals de la indústria gràfica de Catalunya."),
    footerColumns: [{ title: L3("Recursos"), links: [{ label: L3("Formació"), url: "/ca/formacio" }, { label: L3("Actualitat"), url: "/ca/blog" }] }],
    legalLinks: [{ label: L3("Avís legal"), url: "/ca/formacio" }], seoTitle: L3("Apex"), seoDescription: L3("Indústria gràfica"),
  };
  await sql`update settings set data = ${sql.json(settings as never)} where id = 1`;
  await sql.end();
  // The rows above were written straight to the database, so tell the app to drop anything it cached earlier.
  const r = await request.post("/api/cron/revalidate", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(r.status()).toBe(200);
  PAGES = ["/ca", "/es", "/ca/blog", "/ca/blog/categoria/empresa", "/ca/blog/article-1", "/ca/formacio", "/ca/constructor", "/ca/no-existeix", "/ca/search?q=conveni", "/ca/search?q=zzqqxx", "/ca/search", "/styleguide"];
});

const fmt = (v: { id: string; help: string; nodes: { target: unknown[]; failureSummary?: string }[] }[]) =>
  v.map((x) => `${x.id}: ${x.help}\n${x.nodes.slice(0, 3).map((n) => `   ${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1] ?? ""}`).join("\n")}`).join("\n");

async function settle(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

for (const width of WIDTHS) {
  test(`no accessibility violations or overflow at ${width}px`, async ({ page }) => {
    test.setTimeout(150_000); // one test walks every public page
    await page.setViewportSize({ width, height: 900 });
    for (const path of PAGES) {
      await settle(page, path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);

      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(r.violations, `${path} @${width}\n${fmt(r.violations as never)}`).toEqual([]);

      if (width < 900) {
        const small = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".btn, .nav-mobile summary, .langs a, .chips a, .more")]
            .filter((el) => el.offsetParent !== null && el.getBoundingClientRect().height < 43.5)
            .map((el) => `${el.className || el.tagName} ${Math.round(el.getBoundingClientRect().height)}px`));
        expect(small, `${path} @${width}: touch targets under 44px`).toEqual([]);
      }
    }
  });
}

test("keyboard: skip link, mobile menu and visible focus", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await settle(page, "/ca");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Salta al contingut" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#content$/);

  const summary = page.getByText("Menú", { exact: true });
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".nav-mobile .panel").getByRole("link", { name: "Formació" })).toBeVisible();
  const outline = await summary.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none"); // focus is visible
});

test("language switcher points at real translations and marks the current language", async ({ page }) => {
  await settle(page, "/ca/blog/article-1");
  const langs = page.locator(".langs a");
  await expect(langs.filter({ hasText: "CA" })).toHaveAttribute("aria-current", "true");
  await expect(langs.filter({ hasText: "ES" })).toHaveAttribute("href", "/es"); // no Spanish version: falls back to its home
});

test.describe("navigation with dropdowns, header buttons and social links", () => {
  const scan = async (page: Page, label: string) => {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`), label).toEqual([]);
  };

  for (const width of [1100, 1440]) {
    test(`desktop menu @${width}: parents are buttons, keyboard opens and closes them, no accessibility violations while open`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await settle(page, "/ca");
      const nav = page.getByRole("navigation", { name: "Principal" });
      const parent = nav.getByRole("button", { name: "El GREMI" });
      await expect(parent).toHaveAttribute("aria-expanded", "false");
      await expect(nav.getByRole("link", { name: "Nosaltres" })).toBeHidden(); // closed submenus are not reachable
      await expect(nav.getByRole("link", { name: "Formació" })).toBeVisible(); // plain items stay links

      await parent.focus();
      await page.keyboard.press("Enter");
      await expect(parent).toHaveAttribute("aria-expanded", "true");
      await expect(nav.getByRole("link", { name: "Nosaltres" })).toBeVisible();
      await scan(page, `menu open @${width}`);

      await page.keyboard.press("Tab");
      await expect(nav.getByRole("link", { name: "Nosaltres" })).toBeFocused(); // Tab walks into the submenu
      await page.keyboard.press("Escape");
      await expect(parent).toHaveAttribute("aria-expanded", "false");
      await expect(parent).toBeFocused(); // and Escape returns focus to the button

      await parent.click();
      await expect(parent).toHaveAttribute("aria-expanded", "true");
      await page.locator("main").click({ position: { x: 5, y: 5 } }); // clicking elsewhere closes it
      await expect(parent).toHaveAttribute("aria-expanded", "false");

      await parent.click();
      await nav.getByRole("link", { name: "Serveis del GREMI" }).click();
      await expect(page).toHaveURL(/\/ca\/blog$/);
    });
  }

  test("the Campus button and social links: real links, labelled, big enough, external ones are safe", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page, "/ca");
    const campus = page.locator(".header-actions").getByRole("link", { name: "Campus virtual" });
    await expect(campus).toHaveAttribute("href", "https://campus.example");
    await expect(campus).toHaveAttribute("rel", /noopener/);
    expect((await campus.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    const social = page.locator(".social a");
    expect(await social.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Facebook", "Instagram", "YouTube"]);
    for (const box of await social.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
  });

  test("mobile menu: sections expand with the keyboard and hold their links; the Campus button is in the panel", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await settle(page, "/ca");
    await page.getByText("Menú", { exact: true }).click();
    const panel = page.locator(".nav-mobile .panel");
    await expect(panel.getByRole("link", { name: "Campus virtual" })).toBeVisible();
    await expect(panel.getByRole("link", { name: "Nosaltres" })).toBeHidden();
    const sec = panel.getByText("El GREMI", { exact: true });
    await sec.focus();
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("link", { name: "Nosaltres" })).toBeVisible();
    await expect(panel.getByRole("link", { name: "Serveis del GREMI" })).toBeVisible();
    await scan(page, "mobile menu open");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });

  test("an editor can build the menu in the admin: a section with a submenu and a header button", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.goto("/admin/login");
    await page.getByLabel("Correu electrònic").fill("admin@e2e.test");
    await page.getByLabel("Contrasenya").fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Entra" }).click();
    await expect(page.getByRole("heading", { name: "Tauler" })).toBeVisible();
    await page.goto("/admin/settings");
    const form = page.locator("form").filter({ has: page.locator("input[name=data]") });

    const NAV = "Menú principal (cada element pot tenir un submenú)";
    const list = form.locator(".nested", { has: page.getByText(NAV, { exact: true }) }).first();
    const items = list.locator(":scope > .card"); // top-level menu entries only (not their submenu entries)
    const before = await items.count();
    await list.getByRole("button", { name: "+ Afegeix" }).last().click();
    await expect(items).toHaveCount(before + 1); // wait for the new entry to exist before typing into it
    const item = items.nth(before);
    await item.getByRole("group", { name: "Text" }).first().getByLabel("CA").fill("Recursos");
    await item.locator(":scope > .nested").getByRole("button", { name: "+ Afegeix" }).click(); // a submenu entry
    const child = item.locator(":scope > .nested > .card");
    await expect(child).toHaveCount(1);
    await child.getByRole("group", { name: "Text" }).getByLabel("CA").fill("Guia de l'associat");
    await child.getByLabel("Enllaç").fill("/ca/formacio");
    await form.getByRole("button", { name: "Desa" }).click();
    await expect(page.getByRole("status")).toContainText("Desat");

    await page.goto("/ca");
    const nav = page.getByRole("navigation", { name: "Principal" });
    const recursos = nav.getByRole("button", { name: "Recursos" }), guia = nav.getByRole("link", { name: "Guia de l'associat" });
    await expect(async () => { // a click before the page has hydrated does nothing (slow CI machines), so retry until the menu is open
      if ((await recursos.getAttribute("aria-expanded")) !== "true") await recursos.click();
      await expect(guia).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });

    // A top-level item with neither a link nor a submenu is refused.
    await page.goto("/admin/settings");
    const list2 = page.locator("form").filter({ has: page.locator("input[name=data]") }).locator(".nested", { has: page.getByText(NAV, { exact: true }) }).first();
    const items2 = list2.locator(":scope > .card");
    const n2 = await items2.count();
    await list2.getByRole("button", { name: "+ Afegeix" }).last().click();
    await expect(items2).toHaveCount(n2 + 1);
    await items2.nth(n2).getByRole("group", { name: "Text" }).first().getByLabel("CA").fill("Buit");
    await page.getByRole("button", { name: "Desa" }).click();
    await expect(page.getByRole("status")).toContainText("necessita un enllaç");
  });
});

test("search: header box finds published content (accent-insensitive) and says so when nothing matches", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(page, "/ca");
  await page.locator(".header-actions").getByRole("searchbox", { name: "Cerca al web" }).fill("intelligencia artificial");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/ca\/search\?q=/);
  await expect(page.getByRole("link", { name: "Com impacta la intel·ligència artificial al sector" })).toBeVisible();
  await settle(page, "/ca/search?q=zzqqxx");
  await expect(page.getByRole("status")).toContainText("No hem trobat res");
});
