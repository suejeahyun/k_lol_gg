import type { Metadata } from "next";
import RiotPreparationPanel from "@/components/riot/RiotPreparationPanel";

export const metadata: Metadata = {
  title: "Riot API 안내",
};

export default function RiotApiPage() {
  return (
    <RiotPreparationPanel
      eyebrow="RIOT API"
      title="Riot API 연동 안내"
      description="K-LOL.GG는 Production API 승인 후 Riot 계정 연동, 솔랭 티어 동기화, 최근 랭크 경기 분석, 멸망전 참가 검증, 팀 밸런스 보조 기능을 단계적으로 제공할 예정입니다."
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
            "Production API 승인 전까지 Riot 실시간 동기화는 기능 플래그로 차단됩니다.",
            "정책 페이지, 보안 구조, 관리자 화면, 유저 연동 화면을 먼저 준비합니다.",
            "승인 후 Vercel 환경변수에 Production Key를 등록하고 단계적으로 공개합니다.",
          ],
        },
      ]}
      actions={[
        { href: "/me/riot", label: "내 Riot 연동 준비 화면", variant: "primary" },
        { href: "/privacy", label: "개인정보처리방침", variant: "secondary" },
      ]}
    />
  );
}
