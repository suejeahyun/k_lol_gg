import type { Metadata } from "next";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import PremiumLockedPreview from "@/components/PremiumLockedPreview";
import RiotAccountManager from "@/components/riot/RiotAccountManager";
import { getSiteSettings } from "@/lib/site/settings";

export const metadata: Metadata = {
  title: "Riot 계정 연동",
};

export const dynamic = "force-dynamic";

export default async function MeRiotPage() {
  const settings = await getSiteSettings();

  return (
    <PremiumFeatureGate
      feature="riot"
      settings={settings}
      lockedPreview={
        <PremiumLockedPreview
          eyebrow="RIOT PREMIUM"
          title="Riot 계정 연동"
          description="닉네임#태그 검증, Riot 계정 연결, 솔랭 동기화와 현재 티어 자동 반영은 방별 유료 기능입니다."
        />
      }
      renderLockedContent={false}
    >
      <RiotAccountManager
        mode="me"
        eyebrow="MY RIOT ACCOUNT"
        title="Riot 계정 연동"
        description="닉네임#태그로 Riot 계정을 검증하고 솔랭 데이터를 동기화합니다. 동기화가 완료되면 현재 티어가 플레이어 정보와 팀 밸런스에 자동 반영됩니다."
      />
    </PremiumFeatureGate>
  );
}
