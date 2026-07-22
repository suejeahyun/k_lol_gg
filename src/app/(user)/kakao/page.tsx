export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import { getSiteSettings } from "@/lib/site/settings";
import KakaoSearchClient from "./KakaoSearchClient";

export const metadata: Metadata = {
  title: "카카오톡 연동 안내",
  description: "K-LOL.GG 카카오톡 구인 도우미와 플레이어 검색 기능을 확인하세요.",
  alternates: { canonical: "/kakao" },
};

export default async function KakaoPage() {
  const siteSettings = await getSiteSettings();

  return (
    <PremiumFeatureGate feature="kakao" settings={siteSettings}>
      <KakaoSearchClient />
    </PremiumFeatureGate>
  );
}
