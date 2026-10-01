import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/urls";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }, sitemap: `${siteUrl()}/sitemap.xml` };
}
