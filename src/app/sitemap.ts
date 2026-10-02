import type { MetadataRoute } from "next";

import { STATIC_SITEMAP_CONTRACTS, absoluteSiteUrl } from "@/modules/seo/domain/site-seo";
import { loadRuntimeSitemapEntries } from "@/modules/seo/infrastructure/runtime-sitemap";

export const revalidate = 3_600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries = STATIC_SITEMAP_CONTRACTS.map((route) => ({
    url: absoluteSiteUrl(route.template),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
  return [...staticEntries, ...await loadRuntimeSitemapEntries()];
}
