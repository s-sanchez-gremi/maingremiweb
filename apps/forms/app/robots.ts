import type { MetadataRoute } from "next";

// The staff side of the Forms host is not for search engines (public form pages, from step F2, are marked noindex page by page).
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
