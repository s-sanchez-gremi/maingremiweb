// Public renderers, one per section type in sections/registry.ts. Editors fill in content only;
// every look comes from the fixed design tokens in app/(site)/site.css.
import type { ReactNode } from "react";
import { RichText } from "@apex/ui/richtext";
import { embedTarget } from "@/lib/embed";
import { mediaSrcSet, mediaUrl } from "@/lib/media-url";
import { ui, type Locale } from "@/lib/i18n";
import { consentMsgs } from "@/lib/consent/messages";
import { declarations, categories } from "@/lib/consent/registry";
import type { PublicMedia } from "@/lib/content-queries";
import { Embed } from "@/components/site/Embed";
import { SmartLink } from "@/components/site/SmartLink";
import { Card } from "@apex/ui/components/Card";
import { LatestPosts } from "@/components/site/LatestPosts";
import { PublicForm } from "@/components/site/form/PublicForm";
import type { Source } from "@apex/forms/components/FormRenderer";
import { UNSTYLED, type Section } from "@apex/sections/registry";
import { COLUMN_FIELDS, columnCount } from "@apex/sections/blocks";

type Ctx = { media: Record<string, PublicMedia>; locale: Locale; source: Source; edit?: boolean };
/** In the editor's preview only: marks an element as editable in place (field path inside its section/block). */
const ed = (ctx: Ctx, field: string, ph?: string) => (ctx.edit ? { "data-edit": field, ...(ph ? { "data-ph": ph } : {}) } : {});
/** Rich text, editable in place in the preview (the wrapper only exists there). */
function Rich({ ctx, field, body }: { ctx: Ctx; field: string; body: string }) {
  if (!ctx.edit) return <RichText body={body} />;
  return <div data-edit={field} data-edit-kind="rich" data-ph="Escriu el text…">{body.trim() ? <RichText body={body} /> : null}</div>;
}
type Data = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

function Img({ m, sizes, eager }: { m: PublicMedia; sizes: string; eager?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={mediaUrl(m, 960)} srcSet={mediaSrcSet(m)} sizes={sizes} alt={m.alt} width={m.width ?? undefined} height={m.height ?? undefined} loading={eager ? "eager" : "lazy"} />;
}

function Header({ d, ctx, h1, children }: { d: Data; ctx: Ctx; h1: boolean; children?: ReactNode }) {
  const img = ctx.media[str(d.image)];
  const Tag = h1 ? "h1" : "h2";
  return (
    <section className="hero">
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="bg" src={mediaUrl(img, 1600)} srcSet={mediaSrcSet(img)} sizes="100vw" alt="" loading={h1 ? "eager" : "lazy"} />
      )}
      <div className="shade" />
      <div className="wrap">
        {str(d.eyebrow) && <span className="eyebrow" {...ed(ctx, "eyebrow")}>{str(d.eyebrow)}</span>}
        <Tag {...ed(ctx, "title")}>{str(d.title)}</Tag>
        {str(d.subtitle) && <p {...ed(ctx, "subtitle")}>{str(d.subtitle)}</p>}
        {(str(d.linkUrl) || str(d.link2Url)) && (
          <div className="hero-actions">
            {str(d.linkUrl) && <SmartLink href={str(d.linkUrl)} className="btn primary" {...ed(ctx, "linkLabel")}>{str(d.linkLabel) || str(d.linkUrl)}</SmartLink>}
            {str(d.link2Url) && <SmartLink href={str(d.link2Url)} className="btn light" {...ed(ctx, "link2Label")}>{str(d.link2Label) || str(d.link2Url)}</SmartLink>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

type BlockItem = { id: string; type: string; data: Data };

function renderBlock(b: BlockItem, ctx: Ctx): ReactNode {
  const d = b.data;
  const t = ui(ctx.locale);
  switch (b.type) {
    case "heading": {
      const size = str(d.size) || "m";
      const e = ed(ctx, "text", "Escriu el títol…");
      const cls = `b-heading ${size}${str(d.color) === "accent" ? " c-accent" : ""}`;
      return size === "s" ? <h3 className={cls} {...e}>{str(d.text)}</h3> : <h2 className={cls} {...e}>{str(d.text)}</h2>;
    }
    case "text":
      return <div className={`b-text-${str(d.size) || "m"}`}><Rich ctx={ctx} field="body" body={str(d.body)} /></div>;
    case "spacer":
      return <div className={`b-space ${str(d.size) || "m"}`} aria-hidden="true" />;
    case "divider":
      return <hr className={`b-rule ${str(d.look) || "line"}`} />;
    case "image": {
      const m = ctx.media[str(d.image)];
      if (!m) return null;
      return (
        <figure className={`b-fig ${str(d.look) || "plain"}`}>
          <Img m={m} sizes="(min-width:900px) 50vw, 100vw" />
          {(str(d.caption) || m.credit) && <figcaption>{[str(d.caption), m.credit].filter(Boolean).join(" · ")}</figcaption>}
        </figure>
      );
    }
    case "button":
      return str(d.url) ? <div><SmartLink href={str(d.url)} className={`btn${str(d.variant) === "outline" ? "" : str(d.variant) === "dark" ? " dark" : " primary"}${str(d.size) === "l" ? " lg" : ""}`} {...ed(ctx, "label")}>{str(d.label) || str(d.url)}</SmartLink></div> : null;
    case "embed": {
      const target = embedTarget(str(d.url));
      if (!target) return null;
      return <Embed src={target.src} title={target.title} original={str(d.url)} labels={{ load: t.loadEmbed, note: t.embedNote, open: t.openExternal, always: consentMsgs(ctx.locale).allowEmbeds }} />;
    }
    case "card": {
      const m = ctx.media[str(d.image)];
      return (
        <Card image={m ? <Img m={m} sizes="(min-width:900px) 33vw, 100vw" /> : undefined} linked={!!str(d.linkUrl)} className={`look-${str(d.look) || "border"}`}>
          {str(d.label) && <span className="eyebrow" {...ed(ctx, "label")}>{str(d.label)}</span>}
          <h3 {...ed(ctx, "title")}>{str(d.linkUrl) && !ctx.edit ? <SmartLink href={str(d.linkUrl)} className="stretch">{str(d.title)}</SmartLink> : str(d.title)}</h3>
          {str(d.text) && <div className="meta" {...ed(ctx, "text")}>{str(d.text)}</div>}
        </Card>
      );
    }
  }
  return null;
}

function renderOne(s: Section, ctx: Ctx, opts: { h1: boolean; after?: ReactNode }): ReactNode {
  const d = s.data as Data;
  const t = ui(ctx.locale);
  switch (s.type) {
    case "header":
      return <Header d={d} ctx={ctx} h1={opts.h1}>{opts.after}</Header>;
    case "text":
      return <section className="block"><div className="wrap narrow"><Rich ctx={ctx} field="body" body={str(d.body)} /></div></section>;
    case "image": {
      const m = ctx.media[str(d.image)];
      if (!m) return null;
      return (
        <section className="block"><div className="wrap narrow"><figure>
          <Img m={m} sizes="(min-width:900px) 760px, 100vw" />
          {(str(d.caption) || m.credit) && <figcaption>{[str(d.caption), m.credit].filter(Boolean).join(" · ")}</figcaption>}
        </figure></div></section>
      );
    }
    case "embed": {
      const target = embedTarget(str(d.url));
      if (!target) return null;
      return (
        <section className="block"><div className="wrap narrow">
          <Embed src={target.src} title={target.title} original={str(d.url)} labels={{ load: t.loadEmbed, note: t.embedNote, open: t.openExternal, always: consentMsgs(ctx.locale).allowEmbeds }} />
        </div></section>
      );
    }
    case "form":
      return (
        <section className="block"><div className="wrap narrow">
          <PublicForm id={str(d.formId)} locale={ctx.locale} source={ctx.source} />
        </div></section>
      );
    case "cta":
      return (
        <section className="cta"><div className="wrap">
          <div className="cta-text">
            <h2 {...ed(ctx, "heading")}>{str(d.heading)}</h2>
            {str(d.text) && <p {...ed(ctx, "text")}>{str(d.text)}</p>}
          </div>
          {str(d.linkUrl) && <SmartLink href={str(d.linkUrl)} className="btn primary" {...ed(ctx, "linkLabel")}>{str(d.linkLabel) || str(d.linkUrl)}</SmartLink>}
        </div></section>
      );
    case "tileRow": {
      const tiles = (d.tiles as Data[]) ?? [];
      if (!tiles.length) return null;
      return (
        <div className="tiles"><div className="wrap tiles-grid">
          {tiles.map((x, i) => <div className="tile" key={i}><span className="eyebrow" {...ed(ctx, `tiles.${i}.label`)}>{str(x.label)}</span>{str(x.text) && <span {...ed(ctx, `tiles.${i}.text`)}>{str(x.text)}</span>}</div>)}
        </div></div>
      );
    }
    case "cookieList": {
      const c = consentMsgs(ctx.locale);
      return (
        <section className="block"><div className="wrap">
          <div className="sec-head"><h2>{str(d.heading) || c.cookieList}</h2><a href="#cookie-settings" className="btn">{c.change}</a></div>
          <div className="table-wrap" tabIndex={0} role="region" aria-label={c.cookieList}>
            <table className="cookie-table">
              <thead><tr><th scope="col">{c.colName}</th><th scope="col">{c.colCategory}</th><th scope="col">{c.colPurpose}</th><th scope="col">{c.colDuration}</th><th scope="col">{c.colProvider}</th></tr></thead>
              <tbody>{declarations.map((x) => (
                <tr key={x.name}>
                  <th scope="row"><code>{x.name}</code></th>
                  <td>{categories.find((k) => k.id === x.category)!.name[ctx.locale]}</td>
                  <td>{x.purpose[ctx.locale]}</td><td>{x.duration[ctx.locale]}</td><td>{x.provider}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div></section>
      );
    }
    case "latestPosts":
      return <LatestPosts heading={str(d.heading)} count={Number(d.count) || 3} locale={ctx.locale} />;
    case "columns": {
      const n = columnCount(d.layout);
      return (
        <section className="block"><div className="wrap">
          {str(d.heading) && <div className="sec-head"><h2 {...ed(ctx, "heading")}>{str(d.heading)}</h2></div>}
          <div className={`cols l-${str(d.layout) || "1-1"}${(s.style as Record<string, string> | undefined)?.valign === "center" ? " v-center" : ""}`}>
            {COLUMN_FIELDS.slice(0, n).map((c) => (
              <div className="col" key={c} data-col={c}>
                {((d[c] as BlockItem[]) ?? []).map((b) => <div className={`b b-${b.type}`} key={b.id} data-block-id={b.id}>{renderBlock(b, ctx)}</div>)}
              </div>
            ))}
          </div>
        </div></section>
      );
    }
    case "cardGrid": {
      const cards = (d.cards as Data[]) ?? [];
      if (!cards.length) return null;
      const cols = cards.length >= 4 ? "cols-4" : cards.length === 3 ? "cols-3" : "cols-2";
      return (
        <section className="block alt"><div className="wrap">
          {str(d.heading) && <div className="sec-head"><h2 {...ed(ctx, "heading")}>{str(d.heading)}</h2></div>}
          <div className={`grid cards-tight ${cols}`}>
            {cards.map((c, i) => {
              const m = ctx.media[str(c.image)];
              return (
                <Card key={i} image={m ? <Img m={m} sizes="(min-width:900px) 25vw, 100vw" /> : undefined} linked={!!str(c.linkUrl)}>
                  {str(c.label) && <span className="eyebrow" {...ed(ctx, `cards.${i}.label`)}>{str(c.label)}</span>}
                  <h3 {...ed(ctx, `cards.${i}.title`)}>{str(c.linkUrl) && !ctx.edit ? <SmartLink href={str(c.linkUrl)} className="stretch">{str(c.title)}</SmartLink> : str(c.title)}</h3>
                  {str(c.text) && <div className="meta" {...ed(ctx, `cards.${i}.text`)}>{str(c.text)}</div>}
                </Card>
              );
            })}
          </div>
        </div></section>
      );
    }
  }
}

/** Brand style classes for a section's wrapper (see "brand styles" in site.css). Defaults add nothing. */
function styleClass(s: Section): string | undefined {
  if (UNSTYLED.has(s.type) || !s.style) return undefined;
  const { bg, space, align, width } = s.style as Record<string, string>;
  const c = [bg && bg !== "auto" && `sx sx-bg-${bg}`, space && space !== "m" && `sx-sp-${space}`, align === "center" && "sx-center", width && width !== "normal" && `sx-w-${width}`].filter(Boolean);
  return c.length ? c.join(" ") : undefined;
}

/** Renders a page's sections. The first "header" section becomes the page <h1>; `afterHeader` (post meta) is placed inside it. */
export function SectionRenderer({ sections, media, locale, afterHeader, source, edit }: { sections: Section[]; media: Record<string, PublicMedia>; locale: Locale; afterHeader?: ReactNode; source?: Source; edit?: boolean }) {
  const firstHeader = sections.findIndex((s) => s.type === "header");
  return (
    <>
      {sections.map((s, i) => (
        <div key={s.id} className={styleClass(s)} data-section-id={s.id}>{renderOne(s, { media, locale, source: source ?? { path: "", theme: "" }, edit }, { h1: i === firstHeader, after: i === firstHeader ? afterHeader : undefined })}</div>
      ))}
    </>
  );
}
