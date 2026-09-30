// Public renderers, one per section type in sections/registry.ts. Editors fill in content only;
// every look comes from the fixed design tokens in app/(site)/site.css.
import type { ReactNode } from "react";
import { RichText } from "@/lib/richtext";
import { embedTarget } from "@/lib/embed";
import { mediaSrcSet, mediaUrl } from "@/lib/media-url";
import { ui, type Locale } from "@/lib/i18n";
import type { PublicMedia } from "@/lib/content-queries";
import { Embed } from "@/components/site/Embed";
import { SmartLink } from "@/components/site/SmartLink";
import { Card } from "@/components/ui/Card";
import { LatestPosts } from "@/components/site/LatestPosts";
import type { Section } from "./registry";

type Ctx = { media: Record<string, PublicMedia>; locale: Locale };
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
        {str(d.eyebrow) && <span className="eyebrow">{str(d.eyebrow)}</span>}
        <Tag>{str(d.title)}</Tag>
        {str(d.subtitle) && <p>{str(d.subtitle)}</p>}
        {(str(d.linkUrl) || str(d.link2Url)) && (
          <div className="hero-actions">
            {str(d.linkUrl) && <SmartLink href={str(d.linkUrl)} className="btn primary">{str(d.linkLabel) || str(d.linkUrl)}</SmartLink>}
            {str(d.link2Url) && <SmartLink href={str(d.link2Url)} className="btn light">{str(d.link2Label) || str(d.link2Url)}</SmartLink>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

function renderOne(s: Section, ctx: Ctx, opts: { h1: boolean; after?: ReactNode }): ReactNode {
  const d = s.data as Data;
  const t = ui(ctx.locale);
  switch (s.type) {
    case "header":
      return <Header d={d} ctx={ctx} h1={opts.h1}>{opts.after}</Header>;
    case "text":
      return <section className="block"><div className="wrap narrow"><RichText body={str(d.body)} /></div></section>;
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
          <Embed src={target.src} title={target.title} original={str(d.url)} labels={{ load: t.loadEmbed, note: t.embedNote, open: t.openExternal }} />
        </div></section>
      );
    }
    case "form":
      return null; // forms arrive with the form builder (phase 5)
    case "cta":
      return (
        <section className="cta"><div className="wrap">
          <h2>{str(d.heading)}</h2>
          {str(d.text) && <p>{str(d.text)}</p>}
          {str(d.linkUrl) && <SmartLink href={str(d.linkUrl)} className="btn primary">{str(d.linkLabel) || str(d.linkUrl)}</SmartLink>}
        </div></section>
      );
    case "tileRow": {
      const tiles = (d.tiles as Data[]) ?? [];
      if (!tiles.length) return null;
      return (
        <div className="tiles">
          {tiles.map((x, i) => <div className="tile" key={i}><span className="eyebrow">{str(x.label)}</span>{str(x.text) && <span>{str(x.text)}</span>}</div>)}
        </div>
      );
    }
    case "latestPosts":
      return <LatestPosts heading={str(d.heading)} count={Number(d.count) || 3} locale={ctx.locale} />;
    case "cardGrid": {
      const cards = (d.cards as Data[]) ?? [];
      if (!cards.length) return null;
      const cols = cards.length >= 4 ? "cols-4" : cards.length === 3 ? "cols-3" : "cols-2";
      return (
        <section className="block alt"><div className="wrap">
          {str(d.heading) && <div className="sec-head"><h2>{str(d.heading)}</h2></div>}
          <div className={`grid cards-tight ${cols}`}>
            {cards.map((c, i) => {
              const m = ctx.media[str(c.image)];
              return (
                <Card key={i} image={m ? <Img m={m} sizes="(min-width:900px) 25vw, 100vw" /> : undefined}>
                  {str(c.label) && <span className="eyebrow">{str(c.label)}</span>}
                  <h3>{str(c.linkUrl) ? <SmartLink href={str(c.linkUrl)} className="stretch">{str(c.title)}</SmartLink> : str(c.title)}</h3>
                  {str(c.text) && <div className="meta">{str(c.text)}</div>}
                </Card>
              );
            })}
          </div>
        </div></section>
      );
    }
  }
}

/** Renders a page's sections. The first "header" section becomes the page <h1>; `afterHeader` (post meta) is placed inside it. */
export function SectionRenderer({ sections, media, locale, afterHeader }: { sections: Section[]; media: Record<string, PublicMedia>; locale: Locale; afterHeader?: ReactNode }) {
  const firstHeader = sections.findIndex((s) => s.type === "header");
  return (
    <>
      {sections.map((s, i) => (
        <div key={s.id}>{renderOne(s, { media, locale }, { h1: i === firstHeader, after: i === firstHeader ? afterHeader : undefined })}</div>
      ))}
    </>
  );
}
