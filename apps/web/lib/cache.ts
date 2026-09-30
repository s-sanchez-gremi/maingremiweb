import { revalidateTag } from "next/cache";

// Every public read is cached under this one tag. Any content change expires it, so pages
// regenerate on their next visit. One tag = nothing to forget when adding a page type.
export const CONTENT_TAG = "content";
export const revalidateContent = () => revalidateTag(CONTENT_TAG, { expire: 0 });
