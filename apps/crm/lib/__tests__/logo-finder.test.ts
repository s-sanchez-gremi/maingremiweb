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
    expect(siteFromEmail("info@company.example")?.hostname).toBe("company.example");
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
  it("skips the default icons of website builders and the platform sites themselves", () => {
    const html = `<link rel="apple-touch-icon" href="https://s.w.org/images/core/emoji/x.png"><link rel="apple-touch-icon" href="/wp-includes/images/w-logo-blue.png"><link rel="apple-touch-icon" href="/mine.png">`;
    expect(logoCandidates(html, new URL("https://x.cat/")).map((c) => c.url)).toEqual(["https://x.cat/mine.png", "https://x.cat/apple-touch-icon.png"]);
    for (const site of ["weebly.com", "https://www.wix.com", "squarespace.com"]) expect(normalizeSite(site)).toBeNull();
  });
  it("survives broken JSON-LD and relative or odd addresses", () => {
    const c = logoCandidates(`<script type="application/ld+json">{oops</script><link rel="apple-touch-icon" href="img/a.png"><link rel="icon" href="javascript:x">`, new URL("https://y.cat/pagina/"));
    expect(c[0].url).toBe("https://y.cat/pagina/img/a.png");
  });
  it("turns a good image into a small WebP and refuses tiny or banner-shaped ones", async () => {
    // a red square on white (a flat colour alone would count as an empty image)
    const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#ffffff" } }).composite([{ input: { create: { width: Math.floor(w / 2), height: Math.floor(h / 2), channels: 3, background: "#D50032" } }, left: Math.floor(w / 4), top: Math.floor(h / 4) }]).png().toBuffer();
    const ok = await toLogoWebp(await png(400, 300));
    expect(ok && (await sharp(ok).metadata())).toMatchObject({ format: "webp", width: 160 });
    expect(await toLogoWebp(await png(32, 32))).toBeNull();
    expect(await toLogoWebp(await png(1200, 100))).toBeNull();
    expect(await toLogoWebp(Buffer.from("not an image"))).toBeNull();
    // a white mark on a transparent background is empty once flattened on white
    const ghost = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
    expect(await toLogoWebp(ghost)).toBeNull();
  });
});
