// The website (apps/web) caches every public page under one tag and this app WRITES what it shows, so after every change
// (publish, unpublish, media, categories, settings, scheduled publishing) we ask the website to expire that cache.
// Best effort and logged: the change is saved anyway; without the call the website shows it within the hour (ISR revalidate).
import { revalidateWebContent } from "@apex/core/web-cache";

export const revalidateContent = revalidateWebContent;
