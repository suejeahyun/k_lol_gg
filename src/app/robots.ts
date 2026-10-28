import type { MetadataRoute } from "next";
import { SERVICE_BRAND } from "@/lib/service-brand";

import { ROBOTS_ALLOW_PATHS, ROBOTS_DISALLOW_PATHS, absoluteSiteUrl } from "@/modules/seo/domain/site-seo";

export default function robots(): MetadataRoute.Robots {
  if (SERVICE_BRAND.id === "hub") return { rules: { userAgent: "*", allow: ["/", "/community-network"], disallow: ["/admin", "/api", "/account", "/login", "/forbidden"] }, sitemap: absoluteSiteUrl("/sitemap.xml") };
  return {
    rules: {
      userAgent: "*",
      allow: [...ROBOTS_ALLOW_PATHS],
      disallow: [...ROBOTS_DISALLOW_PATHS],
    },
    sitemap: absoluteSiteUrl("/sitemap.xml"),
  };
}
