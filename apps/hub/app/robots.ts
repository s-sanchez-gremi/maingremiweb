import type { MetadataRoute } from "next";

// The Hub is a staff start page: not for search engines.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
