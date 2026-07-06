import type { Metadata } from "next";
import RiotPreparationPanel from "@/components/riot/RiotPreparationPanel";

export const metadata: Metadata = {
  title: "이용약관",
};

export default function TermsPage() {
  return (
    <RiotPreparationPanel
      eyebrow="K-LOL.GG POLICY"
      title="K-LOL.GG 이용약관"
      description="K-LOL.GG는 LoL 커뮤니티 내전, 구인, 멸망전, 플레이어 기록, 팀 밸런스 운영을 지원하는 커뮤니티 플랫폼입니다. Riot API 연동 전 서비스 이용 기준을 명확히 고지합니다."
      sections={[
        {
          title: "서비스 이용 범위",
          items: [
            "플레이어 프로필, 내전 기록, 랭킹, 구인, 이벤트/멸망전 운영 기능을 제공합니다.",
            "관리자는 커뮤니티 운영, 참가 검증, 부정 이용 방지를 위해 필요한 범위에서 데이터를 확인할 수 있습니다.",
            "Riot API 연동 기능은 Production API 승인 후 단계적으로 활성화됩니다.",
          ],
        },
        {
          title: "이용 제한 기준",
          items: [
            "허위 정보 입력, 타인 계정 도용, 운영 방해, 자동화된 과도한 요청은 제한될 수 있습니다.",
            "멸망전 및 이벤트 참가 기준은 각 모집 공지와 운영진 판단 기준을 따릅니다.",
            "보안 또는 API 제한 보호를 위해 일부 기능에는 호출 제한과 관리자 승인이 적용될 수 있습니다.",
          ],
        },
        {
          title: "책임과 고지",
          items: [
            "K-LOL.GG는 Riot Games와 제휴 또는 공식 관계가 없는 커뮤니티 서비스입니다.",
            "Riot Games 및 League of Legends 관련 명칭과 자산의 권리는 Riot Games, Inc.에 있습니다.",
            "정책, 보안, 데이터 처리 기준은 운영 상황에 따라 개정될 수 있습니다.",
          ],
        },
      ]}
      actions={[
        { href: "/privacy", label: "개인정보처리방침", variant: "secondary" },
        { href: "/riot-api", label: "Riot API 안내", variant: "primary" },
      ]}
    />
  );
}
