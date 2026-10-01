import type { MetadataRoute } from "next";

// The CRM host serves staff tools, the client portal and the form API: none of it is for search engines.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
