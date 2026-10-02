import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decode, embedUrl, htmlToParts, warnings } from "../wp-import/clean";
import { loadExport, originalImage, filesNeeded } from "../wp-import/build";
import { chosen, toCsv } from "../wp-import/decisions";
import { parseRich } from "@apex/ui/richtext";

const site = "https://gremi.net";
const base = { title: "Notícia", site, knownAuthor: true };

describe("wp import: cleaning", () => {
  it("keeps paragraphs, bold, italic, links and lists in the site's markdown", () => {
    const parts = htmlToParts(`<h2>Formació</h2><p>Curs de <strong>plegat</strong> i <em>engomat</em>.<br>Inscripcions <a href="https://gremi.net/contacte/">aquí</a>.</p><ul><li>Dilluns</li><li><b>Dimarts</b></li></ul>`);
    expect(parts).toEqual([{ t: "text", body: "**Formació**\n\nCurs de **plegat** i *engomat*.\nInscripcions [aquí](https://gremi.net/contacte/).\n\n- Dilluns\n- **Dimarts**" }]);
    expect(parseRich((parts[0] as { body: string }).body).map((b) => b.t)).toEqual(["p", "p", "ul"]);
  });

  it("drops scripts, styles, forms, handlers and unsafe links; keeps the text around them", () => {
    const parts = htmlToParts(`<p onclick="evil()">Hola<script>document.write('<a href=x>spam</a>')</script> món</p><style>p{}</style><form><input name=a>Envia</form><a href="javascript:alert(1)">clic</a>`);
    expect(parts).toEqual([{ t: "text", body: "Hola món\n\nclic" }]);
  });

  it("splits text around images and allowed embeds, and drops other iframes", () => {
    const parts = htmlToParts(`<p>Abans</p><figure><img src="https://gremi.net/wp-content/uploads/2024/01/foto-300x200.jpg" alt="Foto"></figure><p>Després</p><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?feature=oembed"></iframe><iframe src="https://evil.example/x"></iframe>`);
    expect(parts).toEqual([
      { t: "text", body: "Abans" },
      { t: "image", src: "https://gremi.net/wp-content/uploads/2024/01/foto-300x200.jpg", alt: "Foto" },
      { t: "text", body: "Després" },
      { t: "embed", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    ]);
  });

  it("decodes entities, removes page-builder shortcodes and neutralises markdown characters", () => {
    expect(decode("L&#8217;Associaci&oacute; &amp; co&nbsp;")).toBe("L’Associació & co ");
    expect(htmlToParts(`[vc_row][vc_column]<p>Text *amb* [claus]</p>[/vc_column][/vc_row]`)).toEqual([{ t: "text", body: "Text ∗amb∗ (claus)" }]);
  });

  it("turns table rows into lines", () => {
    expect(htmlToParts(`<table><tr><td>Categoria</td><td>Sou</td></tr><tr><td>Oficial</td><td>1.500 €</td></tr></table>`))
      .toEqual([{ t: "text", body: "Categoria · Sou\nOficial · 1.500 €" }]);
  });

  it("only accepts YouTube and Adobe embeds", () => {
    expect(embedUrl("//www.youtube-nocookie.com/embed/abcdefghijk")).toBe("https://www.youtube.com/watch?v=abcdefghijk");
    expect(embedUrl("https://player.vimeo.com/video/1")).toBe("");
  });
});

describe("wp import: signs of a hacked page", () => {
  const check = (html: string, extra = {}) => warnings({ ...base, html, parts: htmlToParts(html), ...extra });
  const levels = (html: string, extra = {}) => check(html, extra).map((w) => `${w.level}:${w.text.split(" ")[0]}`);

  it("drops an injected hidden block and only reports it, so the real page is kept", () => {
    const html = `<p>El gremi des del 1491.</p><div style="position:absolute; left:-9999px"><a href="https://vegasnow-casino-online.com">casino online</a></div><span hidden>slots</span>`;
    expect(htmlToParts(html)).toEqual([{ t: "text", body: "El gremi des del 1491." }]);
    expect(check(html)).toEqual([{ level: "mitjana", text: "Tenia text o enllaços amagats (s'han tret): vegasnow-casino-online.com" }]);
  });

  it("holds back visible spam, foreign alphabets and late edits", () => {
    expect(levels(`<p>Cheap viagra here</p>`)).toContain("alta:Paraula");
    expect(levels(`<p>Visit <a href="https://best-casino.example">this</a></p>`)).toContain("alta:Paraula");
    expect(levels(`<p>激安 ブランド</p>`)).toContain("alta:Text");
    expect(levels(`<p>UK NSFW Telegram Groups</p>`)).toContain("alta:Paraula");
    expect(levels(`<p>Mira <a href="https://best-list.xyz/a">això</a></p>`)).toContain("alta:Enllaç");
    expect(levels(`<p>ok</p>`, { modified: "2026-09-01T10:00:00", since: "2026-08-15" })).toContain("alta:Modificat");
  });

  it("reports removed code, foreign iframes, external links and unknown authors as medium only", () => {
    expect(levels(`<p>ok</p><script>x</script><iframe src="https://evil.example"></iframe>`)).toEqual(["mitjana:Tenia", "mitjana:Tenia"]);
    expect(levels(`<p><a href="https://www.boe.es/x">BOE</a></p>`, { knownAuthor: false })).toEqual(["mitjana:Autor", "mitjana:Enllaços"]);
    expect(levels(`<p>Curs de <a href="https://www.gremi.net/formacio">formació</a></p>`)).toEqual([]);
  });
});

describe("wp import: export folder and review sheet", () => {
  const dir = mkdtempSync(join(tmpdir(), "wp-"));
  mkdirSync(join(dir, "raw"));
  const w = (n: string, v: unknown) => writeFileSync(join(dir, "raw", n), JSON.stringify(v));
  w("site.json", { site });
  w("categories.json", [{ id: 1, name: "Sense categoria", slug: "sense-categoria" }, { id: 5, name: "Formaci&oacute;", slug: "formacio" }]);
  w("tags.json", [{ id: 9, name: "Cursos", slug: "cursos" }]);
  w("users.json", [{ id: 2, name: "Admin", slug: "admin" }]);
  w("media.json", [{ id: 40, source_url: "https://gremi.net/wp-content/uploads/cover.jpg", alt_text: "Portada" }]);
  w("posts.json", [
    { id: 10, date: "2024-05-02T09:00:00", modified: "2024-05-02T09:00:00", slug: "curs-d%c3%a0rees", link: "https://gremi.net/curs/", title: { rendered: "Curs d&#8217;àrees" }, content: { rendered: `<p>Vine!</p><img src="/wp-content/uploads/a-150x150.png">` }, excerpt: { rendered: "<p>Vine! [&hellip;]</p>" }, author: 2, featured_media: 40, categories: [1, 5], tags: [9] },
    { id: 11, slug: "spam", link: "https://gremi.net/spam/", title: { rendered: "Best casino" }, content: { rendered: "<p>x</p>" }, author: 77 },
  ]);
  w("pages.json", [{ id: 20, slug: "nosaltres", link: "https://gremi.net/nosaltres/", title: { rendered: "Nosaltres" }, content: { rendered: "<p>Qui som</p>" }, author: 2 }]);

  it("builds proposals with category, tags, cover, decoded slug and suspicious items left out", () => {
    const ex = loadExport(dir);
    const post = ex.items.find((i) => i.key === "post-10")!;
    expect(post).toMatchObject({ kind: "post", locale: "ca", title: "Curs d’àrees", slug: "curs-darees", date: "2024-05-02", tags: ["Cursos"], include: true, description: "Vine!" });
    expect(post.category?.slug).toBe("formacio");
    expect(post.cover).toEqual({ src: "https://gremi.net/wp-content/uploads/cover.jpg", alt: "Portada" });
    expect(ex.items.find((i) => i.key === "post-11")!.include).toBe(false);
    expect(filesNeeded(ex.items, site).sort()).toEqual([
      "https://gremi.net/wp-content/uploads/a-150x150.png", "https://gremi.net/wp-content/uploads/a.png", "https://gremi.net/wp-content/uploads/cover.jpg",
    ]);
  });

  it("writes a sheet whose 'importar' column decides, also after Excel saves it with commas", () => {
    const ex = loadExport(dir);
    const csv = toCsv(ex.items);
    expect([...chosen(csv)].sort()).toEqual(["page-20", "post-10"]);
    expect([...chosen("importar,id,títol\nno,post-10,\"Curs, nou\"\nSí,post-11,x\n")]).toEqual(["post-11"]);
  });

  it("prefers the full-size image once it is downloaded", () => {
    expect(originalImage("https://gremi.net/u/foto-1024x683.jpeg")).toBe("https://gremi.net/u/foto.jpeg");
  });
});
