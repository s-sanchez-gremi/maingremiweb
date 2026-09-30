import type { PostCard as Card, PublicMedia } from "@/lib/content-queries";
import { formatDate, ui, type Locale } from "@/lib/i18n";
import { mediaSrcSet, mediaUrl } from "@/lib/media-url";
import { entryPath } from "@/lib/urls";
import { SmartLink } from "./SmartLink";

export function PostCard({ post, media, locale }: { post: Card; media: Record<string, PublicMedia>; locale: Locale }) {
  const cover = post.coverMediaId ? media[post.coverMediaId] : undefined;
  const t = ui(locale);
  return (
    <article className="card">
      <div className="img">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(cover, 480)} srcSet={mediaSrcSet(cover)} sizes="(min-width:900px) 33vw, 100vw" alt={cover.alt} loading="lazy" width={cover.width ?? undefined} height={cover.height ?? undefined} />
        )}
      </div>
      <div className="body">
        {post.category && <span className="eyebrow">{post.category.name}</span>}
        <h3><SmartLink href={entryPath("post", locale, post.slug)} className="stretch">{post.title || t.untitled}</SmartLink></h3>
        <div className="meta">{[post.author, post.publishedOn ? formatDate(post.publishedOn, locale) : null].filter(Boolean).join(" · ")}</div>
      </div>
    </article>
  );
}
