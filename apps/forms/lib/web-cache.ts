// The form builder (this app) and the CMS admin both ask the website to expire its cache after a change: the shared helper
// lives in @apex/core/web-cache. Kept here so existing imports of "@/lib/web-cache" keep working.
export { revalidateWebContent } from "@apex/core/web-cache";
