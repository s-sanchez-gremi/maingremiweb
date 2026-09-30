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
  const L3 = (ca: string) => ({ ca, es: ca, en: ca });
  const settings = {
    homepage: home, phone: "+34 93 000 00 00", email: "info@apex.example", portalUrl: "/ca/blog", contactUrl: "/ca/formacio",
    nav: [{ label: L3("Formació"), url: "/ca/formacio" }, { label: L3("Actualitat"), url: "/ca/blog" }],
    footerText: L3("Representant i donant suport als professionals de la indústria gràfica de Catalunya."),
    footerColumns: [{ title: L3("Recursos"), links: [{ label: L3("Formació"), url: "/ca/formacio" }, { label: L3("Actualitat"), url: "/ca/blog" }] }],
    legalLinks: [{ label: L3("Avís legal"), url: "/ca/formacio" }], seoTitle: L3("Apex"), seoDescription: L3("Indústria gràfica"),
  };
  await sql`update settings set data = ${sql.json(settings as never)} where id = 1`;
  await sql.end();
  // The rows above were written straight to the database, so tell the app to drop anything it cached earlier.
  const r = await request.post("/api/cron/revalidate", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(r.status()).toBe(200);
  PAGES = ["/ca", "/es", "/ca/blog", "/ca/blog/categoria/empresa", "/ca/blog/article-1", "/ca/formacio", "/ca/no-existeix", "/styleguide"];
});

const fmt = (v: { id: string; help: string; nodes: { target: unknown[]; failureSummary?: string }[] }[]) =>
  v.map((x) => `${x.id}: ${x.help}\n${x.nodes.slice(0, 3).map((n) => `   ${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1] ?? ""}`).join("\n")}`).join("\n");

async function settle(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

for (const width of WIDTHS) {
  test(`no accessibility violations or overflow at ${width}px`, async ({ page }) => {
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
