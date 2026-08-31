import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내전 전적·시즌 랭킹",
  description:
    "K-LOL.GG에서 리그 오브 레전드 내전 전적, 시즌 TOP 3, 최근 MVP와 멸망전 진행 현황을 확인하세요.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "K-LOL.GG | 내전 전적·시즌 랭킹",
    description:
      "리그 오브 레전드 내전 전적, 시즌 랭킹, 최근 MVP와 멸망전 진행 현황을 한눈에 확인하세요.",
    type: "website",
    images: [
      {
        url: "/images/theme/bloom/klol-bloom-hero-v1.webp",
        width: 1600,
        height: 900,
        alt: "구름 위에서 함께 경기를 준비하는 K-LOL.GG 오리지널 판타지 팀",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "K-LOL.GG | 내전 전적·시즌 랭킹",
    description: "내전 전적, 시즌 랭킹, 최근 MVP를 확인하세요.",
    images: ["/images/theme/bloom/klol-bloom-hero-v1.webp"],
  },
};

export * from "./page.impl";
export { default } from "./page.impl";
