import { describe, expect, it } from "vitest";
import { parseInline, parseRich, safeHref } from "@apex/ui/richtext";
import { embedTarget } from "../embed";
import { mediaSrcSet, mediaUrl } from "@apex/core/media-url";

describe("rich text", () => {
  it("parses paragraphs, bold, italic, links and lists", () => {
    const b = parseRich("Hola **món** i *tu*\nsegona línia\n\n- un\n- dos\n\n[Apex](https://apex.example)");
    expect(b.map((x) => x.t)).toEqual(["p", "ul", "p"]);
    expect(parseInline("a **b** [c](/d)")).toEqual([{ t: "text", v: "a " }, { t: "b", v: "b" }, { t: "text", v: " " }, { t: "a", v: "c", href: "/d" }]);
  });
  it("never produces a dangerous link and never passes HTML through", () => {
    expect(safeHref("javascript:alert(1)")).toBe(false);
    expect(safeHref("data:text/html,x")).toBe(false);
    const bad = parseInline("[clic](javascript:alert(1))");
    expect(bad.some((n) => n.t === "a")).toBe(false);
    expect(bad[0]).toEqual({ t: "text", v: "clic" });
    expect(parseInline("<img src=x onerror=alert(1)>")).toEqual([{ t: "text", v: "<img src=x onerror=alert(1)>" }]); // plain text; React escapes it
  });
});

describe("embeds", () => {
  it("builds privacy-friendly YouTube embed URLs", () => {
    expect(embedTarget("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(embedTarget("https://youtu.be/dQw4w9WgXcQ")?.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(embedTarget("https://youtube.com/watch?v=<script>")).toBeNull();
    expect(embedTarget("https://express.adobe.com/page/abc")?.provider).toBe("adobe");
    expect(embedTarget("https://evil.example/x")).toBeNull();
  });
});

describe("media urls", () => {
  it("only offers widths that exist", () => {
    process.env.S3_PUBLIC_URL = "http://s3/b";
    const m = { key: "media/x", mime: "image/webp", width: 1000 };
    expect(mediaSrcSet(m)).toBe("http://s3/b/media/x/480.webp 480w, http://s3/b/media/x/960.webp 960w, http://s3/b/media/x/1000.webp 1000w");
    expect(mediaUrl(m, 1600)).toBe("http://s3/b/media/x/1000.webp");
    expect(mediaUrl({ ...m, mime: "application/pdf" })).toBe("http://s3/b/media/x/file.pdf");
  });
});
