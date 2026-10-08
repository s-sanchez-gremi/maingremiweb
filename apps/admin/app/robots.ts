import type { MetadataRoute } from "next";

// The admin host is for staff only: none of it is for search engines.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
