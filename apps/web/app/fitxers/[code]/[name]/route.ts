// Shareable link of a media-library file: /fitxers/<code>/<name> → the file in the public media bucket.
// The name part is only for people reading the link; the code alone decides the file. Lookups are cached with the
// site (tag `content`), so links keep working during a database outage; deleting a file expires the cache.
import { unstable_cache } from "next/cache";
import { CONTENT_TAG } from "@/lib/cache";
import { findByCode } from "@apex/core/media-share";
import { mediaUrl } from "@apex/core/media-url";

class Missing extends Error {}

const lookup = unstable_cache(async (code: string) => {
  const m = await findByCode(code);
  if (!m) throw new Missing(); // thrown, so "not found" is never cached
  return { key: m.key, mime: m.mime, width: m.width };
}, ["share-link"], { tags: [CONTENT_TAG], revalidate: 3600 });

export async function GET(_req: Request, { params }: { params: Promise<{ code: string; name: string }> }) {
  const { code } = await params;
  try {
    const m = await lookup(code);
    return new Response(null, {
      status: 302,
      headers: { Location: mediaUrl(m, 1600), "Cache-Control": "public, max-age=60", "X-Robots-Tag": "noindex" },
    });
  } catch (e) {
    if (e instanceof Missing || !/^[0-9a-f]{8}$/.test(code)) return new Response("No s'ha trobat el fitxer", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
    throw e;
  }
}
