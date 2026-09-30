import { getCategories, getMedia, getPosts } from "@/lib/content";
import { ui, type Locale } from "@/lib/i18n";
import { blogPath, categoryPath } from "@/lib/urls";
import { PostCard } from "./PostCard";
import Link from "next/link";

export async function BlogList({ locale, categorySlug }: { locale: Locale; categorySlug?: string }) {
  const [posts, cats] = await Promise.all([getPosts(locale, categorySlug), getCategories(locale)]);
  const media = await getMedia(posts.map((p) => p.coverMediaId).filter((x): x is string => !!x), locale);
  const t = ui(locale);
  return (
    <>
      {cats.length > 0 && (
        <nav className="chips" aria-label={t.category}>
          <Link href={blogPath(locale)} aria-current={!categorySlug ? "page" : undefined}>{t.allCategories}</Link>
          {cats.map((c) => <Link key={c.slug} href={categoryPath(locale, c.slug)} aria-current={c.slug === categorySlug ? "page" : undefined}>{c.name}</Link>)}
        </nav>
      )}
      {posts.length === 0 ? <p className="empty">{t.noPosts}</p> : (
        <div className="grid cols-3">{posts.map((p) => <PostCard key={p.entryId} post={p} media={media} locale={locale} />)}</div>
      )}
    </>
  );
}
