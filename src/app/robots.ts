import type { MetadataRoute } from "next";

import { ROBOTS_ALLOW_PATHS, ROBOTS_DISALLOW_PATHS, absoluteSiteUrl } from "@/modules/seo/domain/site-seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [...ROBOTS_ALLOW_PATHS],
      disallow: [...ROBOTS_DISALLOW_PATHS],
    },
    sitemap: absoluteSiteUrl("/sitemap.xml"),
  };
}
