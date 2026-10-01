import type { PostCard as PostCardData, PublicMedia } from "@/lib/content-queries";
import { formatDate, ui, type Locale } from "@/lib/i18n";
import { mediaSrcSet, mediaUrl } from "@/lib/media-url";
import { entryPath } from "@/lib/urls";
import { Card } from "@apex/ui/components/Card";
import { SmartLink } from "./SmartLink";

export function PostCard({ post, media, locale }: { post: PostCardData; media: Record<string, PublicMedia>; locale: Locale }) {
  const cover = post.coverMediaId ? media[post.coverMediaId] : undefined;
  const t = ui(locale);
  return (
    <Card
      image={cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(cover, 480)} srcSet={mediaSrcSet(cover)} sizes="(min-width:900px) 33vw, 100vw" alt={cover.alt} loading="lazy" width={cover.width ?? undefined} height={cover.height ?? undefined} />
      ) : undefined}
      linked
    >
      {post.category && <span className="eyebrow">{post.category.name}</span>}
      <h3><SmartLink href={entryPath("post", locale, post.slug)} className="stretch">{post.title || t.untitled}</SmartLink></h3>
      <div className="meta">{[post.author, post.publishedOn ? formatDate(post.publishedOn, locale) : null].filter(Boolean).join(" · ")}</div>
    </Card>
  );
}
