import type { Metadata } from "next";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import PremiumLockedPreview from "@/components/PremiumLockedPreview";
import { getSiteSettings } from "@/lib/site/settings";
import RandomTeamClient from "./RandomTeamClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "랜덤 팀 나누기",
  description: "참가자 명단을 두 팀으로 빠르게 나누고 결과를 복사할 수 있는 K-LOL.GG 랜덤 팀 도구입니다.",
  alternates: { canonical: "/random-team" },
};

export default async function PublicRandomTeamPage() {
  const settings = await getSiteSettings();

  return (
    <PremiumFeatureGate
      feature="randomTeam"
      settings={settings}
      lockedPreview={
        <PremiumLockedPreview
          eyebrow="RANDOM TEAM PREMIUM"
          title="랜덤 팀 나누기"
          description="10인 명단을 RED/BLUE로 즉시 분배하고 간단 티어 밸런스를 적용하는 방별 유료 도구입니다."
          items={[
            { label: "대상", value: "공개 도구" },
            { label: "권한", value: "방별 오픈" },
            { label: "관리", value: "슈퍼어드민" },
          ]}
        />
      }
      renderLockedContent={false}
    >
      <RandomTeamClient />
    </PremiumFeatureGate>
  );
}
