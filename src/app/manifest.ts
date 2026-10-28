import { SERVICE_BRAND } from "@/lib/service-brand";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  if (SERVICE_BRAND.id === "community") {
    const { readRuntimeCommunitySiteConfiguration } = await import("@/modules/community-sites/infrastructure/runtime-site-configuration");
    const runtime = await readRuntimeCommunitySiteConfiguration().catch(() => null);
    const config = runtime?.configuration;
    return { id: "/", name: config?.name ?? SERVICE_BRAND.name, short_name: (config?.name ?? SERVICE_BRAND.name).slice(0, 24),
      description: config?.description || "함께 만드는 우리 커뮤니티", start_url: "/", scope: "/", display: "browser", lang: "ko-KR",
      theme_color: config?.primaryColor ?? "#536dfe", background_color: config?.templateId === "club" ? "#f6f8f5" : "#0d1425",
      icons: [{ src: config?.logoUrl || "/icons/hub/mark.svg", sizes: "any" }] };
  }
  if (SERVICE_BRAND.id === "hub") return { id: "/", name: "GG HUB", short_name: "GG HUB", description: "여러 독립 커뮤니티 사이트와 방을 관리하는 중앙 서비스", start_url: "/", scope: "/", display: "browser", background_color: "#f5f7f7", theme_color: "#123b3b", lang: "ko-KR", icons: [{ src: "/icons/hub/mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }] };
  const isNexus = SERVICE_BRAND.id === "nexus";
  const iconPrefix = isNexus ? "/icons/nexus" : "/icons";
  return {
    id: "/",
    name: SERVICE_BRAND.name,
    short_name: SERVICE_BRAND.name,
    description: "함께 즐기는 리그 오브 레전드 내전 커뮤니티",
    start_url: "/start?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: isNexus ? "#080e1d" : "#f7fbff",
    theme_color: isNexus ? "#080e1d" : "#89bdf2",
    orientation: "any",
    lang: "ko-KR",
    categories: ["games", "social", "sports"],
    icons: [
      { src: `${iconPrefix}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${iconPrefix}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${iconPrefix}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "플레이어 찾기", short_name: "플레이어", url: "/players", icons: [{ src: `${iconPrefix}/icon-192.png`, sizes: "192x192" }] },
      { name: "최근 경기", short_name: "경기", url: "/matches", icons: [{ src: `${iconPrefix}/icon-192.png`, sizes: "192x192" }] },
      { name: "팀 밸런스", short_name: "팀 도구", url: "/tools/team-balance", icons: [{ src: `${iconPrefix}/icon-192.png`, sizes: "192x192" }] },
    ],
  };
}
