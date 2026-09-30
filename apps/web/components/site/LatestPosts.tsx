import { getMedia, getPosts } from "@/lib/content";
import { ui, type Locale } from "@/lib/i18n";
import { blogPath } from "@/lib/urls";
import { PostCard } from "./PostCard";
import { SmartLink } from "./SmartLink";

/** Automatic news grid: always the newest published posts in the page's language. */
export async function LatestPosts({ heading, count, locale }: { heading: string; count: number; locale: Locale }) {
  const posts = (await getPosts(locale)).slice(0, count);
  if (!posts.length) return null;
  const media = await getMedia(posts.map((p) => p.coverMediaId).filter((x): x is string => !!x), locale);
  const t = ui(locale);
  return (
    <section className="block"><div className="wrap">
      <div className="sec-head"><h2>{heading || t.latest}</h2><SmartLink href={blogPath(locale)} className="more">{t.allNews} →</SmartLink></div>
      <div className={`grid ${count >= 3 ? "cols-3" : "cols-2"}`}>
        {posts.map((p) => <PostCard key={p.entryId} post={p} media={media} locale={locale} />)}
      </div>
    </div></section>
  );
}
