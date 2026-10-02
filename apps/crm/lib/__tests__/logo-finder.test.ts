import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { logoCandidates, normalizeSite, siteFromEmail } from "../logo-finder/find";
import { toLogoWebp } from "../logo-finder/image";

describe("logo finder", () => {
  it("accepts public web addresses only", () => {
    expect(normalizeSite("laplana.com")?.toString()).toBe("https://laplana.com/");
    expect(normalizeSite(" www.x.cat/ca ; altra.com")?.hostname).toBe("www.x.cat");
    for (const bad of ["", "localhost", "127.0.0.1", "http://192.168.1.5/x", "intranet", "ftp://x.com", "mail:pere@x.com", "https://www.linkedin.com/company/x", "behance.net/oscar", "x.wixsite.com/tienda"]) expect(normalizeSite(bad)).toBeNull();
  });
  it("guesses a site from a business e-mail, never from a free provider", () => {
    expect(siteFromEmail("info@graficas3g.com")?.hostname).toBe("graficas3g.com");
    expect(siteFromEmail("pere@gmail.com", "admin@palahi.cat; quim")?.hostname).toBe("palahi.cat");
    expect(siteFromEmail("a@hotmail.com", "", "b@telefonica.net")).toBeNull();
  });
  it("ranks the logo the site declares: JSON-LD first, then Apple touch icon, then big icons; ignores .ico and small icons", () => {
    const html = `<head>
      <link rel="icon" href="/favicon.ico"><link rel="icon" sizes="32x32" href="/f32.png"><link rel="icon" sizes="192x192" href="/f192.png">
      <link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
      <script type="application/ld+json">{"@type":"Organization","logo":{"@type":"ImageObject","url":"https://cdn.x.com/logo.svg"}}</script></head>`;
    const c = logoCandidates(html, new URL("https://x.com/ca/"));
    expect(c.map((x) => x.kind)).toEqual(["jsonld", "apple", "icon", "fallback"]);
    expect(c[0].url).toBe("https://cdn.x.com/logo.svg");
    expect(c[1].url).toBe("https://x.com/apple.png");
    expect(c.some((x) => /favicon\.ico|f32/.test(x.url))).toBe(false);
  });
  it("survives broken JSON-LD and relative or odd addresses", () => {
    const c = logoCandidates(`<script type="application/ld+json">{oops</script><link rel="apple-touch-icon" href="img/a.png"><link rel="icon" href="javascript:x">`, new URL("https://y.cat/pagina/"));
    expect(c[0].url).toBe("https://y.cat/pagina/img/a.png");
  });
  it("turns a good image into a small WebP and refuses tiny or banner-shaped ones", async () => {
    const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#D50032" } }).png().toBuffer();
    const ok = await toLogoWebp(await png(400, 300));
    expect(ok && (await sharp(ok).metadata())).toMatchObject({ format: "webp", width: 160 });
    expect(await toLogoWebp(await png(32, 32))).toBeNull();
    expect(await toLogoWebp(await png(1200, 100))).toBeNull();
    expect(await toLogoWebp(Buffer.from("not an image"))).toBeNull();
  });
});
