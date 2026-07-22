import type { Metadata } from "next";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import PremiumLockedPreview from "@/components/PremiumLockedPreview";
import RiotPreparationPanel from "@/components/riot/RiotPreparationPanel";
import { getSiteSettings } from "@/lib/site/settings";
import { isRiotFeatureEnabled } from "@/lib/riot/feature";

export const metadata: Metadata = {
  title: "Riot API 안내",
  description: "K-LOL.GG의 Riot API 연동 범위, 계정 인증 방식과 데이터 갱신 정책을 확인하세요.",
  alternates: { canonical: "/riot-api" },
};

export const dynamic = "force-dynamic";

export default async function RiotApiPage() {
  const settings = await getSiteSettings();
  const riotEnabled = isRiotFeatureEnabled();

  return (
    <PremiumFeatureGate
      feature="riot"
      settings={settings}
      lockedPreview={
        <PremiumLockedPreview
          eyebrow="RIOT API PREMIUM"
          title="Riot API 연동 안내"
          description="Riot 연동 안내와 연결 화면은 방별 Riot 기능이 열렸을 때 사용할 수 있습니다."
        />
      }
      renderLockedContent={false}
    >
      <RiotPreparationPanel
        eyebrow="RIOT API"
        title="Riot API 연동 안내"
        description="K-LOL.GG는 Riot 계정 연동, 솔랭 티어 동기화, 최근 랭크 경기 분석, 멸망전 참가 검증, 팀 밸런스 보조 기능을 단계적으로 제공합니다."
        sections={[
          {
            title: "연동 목적",
            items: [
              "유저가 Riot ID를 연결하면 현재 솔로랭크 정보를 자동으로 확인할 수 있게 합니다.",
              "최근 랭크 경기 요약을 이용해 주 라인, 주 챔피언, 최근 폼을 표시합니다.",
              "내전 밸런스와 멸망전 티어 검증에 Riot 데이터를 보조 지표로 사용합니다.",
            ],
          },
          {
            title: "보안 원칙",
            items: [
              "Riot API Key는 서버 환경변수에만 저장하고 브라우저에 노출하지 않습니다.",
              "프론트엔드는 K-LOL.GG 내부 API만 호출하고, Riot API 호출은 서버에서만 수행합니다.",
              "페이지 접속마다 Riot API를 호출하지 않고 DB 캐시 데이터를 우선 표시합니다.",
            ],
          },
          {
            title: "현재 상태",
            items: [
              "Riot 실시간 동기화는 운영 기능 플래그와 서버 인증 정보가 모두 준비된 경우에만 동작합니다.",
              "현재 공개 여부는 이 페이지 상단의 활성·비활성 상태에서 확인할 수 있습니다.",
              "Riot API Key와 연동 설정은 Vercel 서버 환경변수에서만 관리합니다.",
            ],
          },
        ]}
        actions={[
          {
            href: "/me/riot",
            label: riotEnabled ? "내 Riot 계정 연결" : "내 Riot 연동 준비 화면",
            variant: "primary",
          },
          { href: "/privacy", label: "개인정보처리방침", variant: "secondary" },
        ]}
      />
    </PremiumFeatureGate>
  );
}
