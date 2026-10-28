import type { MetadataRoute } from "next";
import { SERVICE_BRAND } from "@/lib/service-brand";

import { STATIC_SITEMAP_CONTRACTS, absoluteSiteUrl } from "@/modules/seo/domain/site-seo";
import { loadRuntimeSitemapEntries } from "@/modules/seo/infrastructure/runtime-sitemap";

export const revalidate = 3_600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (SERVICE_BRAND.id === "hub") return [{ url: absoluteSiteUrl("/"), changeFrequency: "weekly", priority: 1 }, { url: absoluteSiteUrl("/community-network"), changeFrequency: "weekly", priority: .8 }];
  const staticEntries = STATIC_SITEMAP_CONTRACTS.map((route) => ({
    url: absoluteSiteUrl(route.template),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
  return [...staticEntries, ...await loadRuntimeSitemapEntries()];
}
