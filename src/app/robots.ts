import type { MetadataRoute } from "next";

import { getPublicBaseUrl } from "@/lib/http/base-url";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getPublicBaseUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/app",
        "/account",
        "/me/",
        "/participation",
        "/players/balance",
        "/destruction-auction-live",
        "/login",
        "/signup",
        "/forgot-password",
        "/install",
        "/apk",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
