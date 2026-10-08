import type { MetadataRoute } from "next";

// The Signatures host is not for search engines: the staff side is closed, and the signer pages (from step S3) are noindex page by page.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
