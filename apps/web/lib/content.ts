// Cached public reads. Everything shares the "content" tag (see lib/cache.ts): one revalidateContent() refreshes it all.
// If the database is down, Next keeps serving the last cached pages.
import { unstable_cache } from "next/cache";
import { CONTENT_TAG } from "./cache";
import * as q from "./content-queries";

const cached = <A extends unknown[], R>(name: string, fn: (...a: A) => Promise<R>) =>
  unstable_cache(fn, ["content", name], { tags: [CONTENT_TAG], revalidate: 3600 });

export const getEntryBySlug = cached("entry-by-slug", q.queryEntryBySlug);
export const getEntryById = cached("entry-by-id", q.queryEntryById);
export const getPosts = cached("posts", q.queryPosts);
export const getCategories = cached("categories", q.queryCategories);
export const getAlternates = cached("alternates", q.queryAlternates);
export const getMedia = cached("media", q.queryMedia);
export const getSettings = cached("settings", q.querySettings);
export const getAllLive = cached("all-live", q.queryAllLive);
export const getFormBySlug = cached("form-by-slug", q.queryFormBySlug);
export const getFormById = cached("form-by-id", q.queryFormById);
