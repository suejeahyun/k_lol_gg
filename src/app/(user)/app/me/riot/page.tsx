import type { Metadata } from "next";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import PremiumLockedPreview from "@/components/PremiumLockedPreview";
import RiotAccountManager from "@/components/riot/RiotAccountManager";
import { getSiteSettings } from "@/lib/site/settings";

export const metadata: Metadata = {
  title: "APP Riot 계정 연동",
};

export const dynamic = "force-dynamic";

export default async function AppMeRiotPage() {
  const settings = await getSiteSettings();

  return (
    <PremiumFeatureGate
      feature="riot"
      settings={settings}
      lockedPreview={
        <PremiumLockedPreview
          eyebrow="APP RIOT PREMIUM"
          title="앱 Riot 계정 연동"
          description="모바일 Riot 연동 상태 확인과 솔랭 동기화는 방별 유료 기능입니다."
        />
      }
      renderLockedContent={false}
    >
      <RiotAccountManager
        mode="me"
        eyebrow="K-LOL.GG APP"
        title="앱 Riot 계정 연동"
        description="모바일 앱 화면에서 Riot ID 연결 상태와 솔랭 캐시를 확인합니다. Production API 승인 후 동일한 서버 보안 구조로 연결 기능을 엽니다."
        compact
      />
    </PremiumFeatureGate>
  );
}
