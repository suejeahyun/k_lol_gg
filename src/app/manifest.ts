import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "K-LOL.GG V2",
    short_name: "K-LOL.GG",
    description: "함께 즐기는 리그 오브 레전드 내전 커뮤니티",
    start_url: "/start?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#f7fbff",
    theme_color: "#89bdf2",
    orientation: "any",
    lang: "ko-KR",
    categories: ["games", "social", "sports"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "플레이어 찾기", short_name: "플레이어", url: "/players", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "최근 경기", short_name: "경기", url: "/matches", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "팀 밸런스", short_name: "팀 도구", url: "/tools/team-balance", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
