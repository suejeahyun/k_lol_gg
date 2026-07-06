import type { Metadata } from "next";
import RiotPreparationPanel from "@/components/riot/RiotPreparationPanel";

export const metadata: Metadata = {
  title: "개인정보처리방침",
};

export default function PrivacyPage() {
  return (
    <RiotPreparationPanel
      eyebrow="K-LOL.GG PRIVACY"
      title="개인정보처리방침"
      description="Riot API 연동을 준비하면서 K-LOL.GG가 수집·보관·이용할 수 있는 계정 및 게임 데이터의 범위를 사전에 고지합니다."
      sections={[
        {
          title: "수집 예정 항목",
          items: [
            "K-LOL.GG 계정 정보, 플레이어 이름, 닉네임, 태그, 승인 상태를 저장합니다.",
            "Riot 연동 시 Riot ID, PUUID, 소환사 식별자, 프로필 아이콘, 소환사 레벨을 저장할 수 있습니다.",
            "솔로랭크/자유랭크 티어, LP, 승패, 최근 경기 요약, 주 라인, 주 챔피언 통계를 캐싱할 수 있습니다.",
          ],
        },
        {
          title: "이용 목적",
          items: [
            "플레이어 프로필 정확도 향상, 내전 팀 밸런스 보조, 멸망전 참가 티어 검증에 사용합니다.",
            "관리자 운영 화면에서 미연동, 갱신 실패, 티어 차이, 데이터 갱신 상태를 확인하는 데 사용합니다.",
            "API 호출량을 줄이기 위해 Riot 데이터를 서버 DB에 캐싱하고 화면에는 캐싱된 요약 데이터를 표시합니다.",
          ],
        },
        {
          title: "보관 및 삭제",
          items: [
            "Riot 연동 해제 또는 계정 삭제 요청 시 연결 정보와 캐시 데이터는 운영 기준에 따라 삭제 또는 비활성화합니다.",
            "부정 이용 방지와 운영 감사 목적의 로그는 필요한 기간 동안 제한적으로 보관할 수 있습니다.",
            "Production API 승인 전에는 일반 유저 대상 Riot 실시간 동기화 기능을 열지 않습니다.",
          ],
        },
      ]}
      actions={[
        { href: "/terms", label: "이용약관", variant: "secondary" },
        { href: "/riot-api", label: "Riot API 안내", variant: "primary" },
      ]}
    />
  );
}
