import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState, ErrorPage, Halftone, InkBar } from "@apex/ui/components/Identity";

const css = readFileSync(join(process.cwd(), "../../packages/ui/src/identity.css"), "utf8");

describe("identity shell kit", () => {
  it("decorative parts are hidden from assistive technology", () => {
    expect(renderToStaticMarkup(<Halftone />)).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(<InkBar />)).toContain('aria-hidden="true"');
  });
  it("an empty state has one heading, its text and its action; the halftone is decorative", () => {
    const html = renderToStaticMarkup(<EmptyState title="Cap formulari" eyebrow="Forms" action={<button type="button">Crea</button>}>Aquí apareixeran.</EmptyState>);
    expect(html.match(/<h2>/g)).toHaveLength(1);
    expect(html).toContain("Cap formulari");
    expect(html).toContain("Aquí apareixeran.");
    expect(html).toContain('<button type="button">Crea</button>');
    expect(html).toContain('aria-hidden="true"');
  });
  it("an empty state can use h3 inside a page that already has an h2", () => {
    expect(renderToStaticMarkup(<EmptyState as="h3" title="T" />)).toContain("<h3>T</h3>");
  });
  it("an error page is a main landmark with one h1, and the big code is not read twice", () => {
    const html = renderToStaticMarkup(<ErrorPage code="404" title="No trobem aquesta pàgina" action={<button type="button">Torna</button>}>{"Pot ser que s'hagi mogut."}</ErrorPage>);
    expect(html).toMatch(/^<main /);
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).toContain('<p class="id-code" aria-hidden="true">404</p>');
  });
  it("the kit stylesheet defines no colour of its own (tokens only)", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
  });
});
