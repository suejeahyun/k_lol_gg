import type { Metadata } from "next";
import RiotPreparationPanel from "@/components/riot/RiotPreparationPanel";

export const metadata: Metadata = {
  title: "이용약관",
  description: "K-LOL.GG 서비스 이용 범위, 계정 관리, 이용 제한 및 운영 기준을 안내합니다.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <RiotPreparationPanel
      eyebrow="K-LOL.GG POLICY"
      title="K-LOL.GG 이용약관"
      description="K-LOL.GG는 LoL 커뮤니티 내전, 구인, 멸망전, 플레이어 기록, 팀 밸런스 운영을 지원하는 커뮤니티 플랫폼입니다. 시행일: 2026년 7월 21일"
      showStatus={false}
      sections={[
        {
          title: "서비스 이용 범위",
          items: [
            "플레이어 프로필, 내전 기록, 랭킹, 구인, 이벤트/멸망전 운영 기능을 제공합니다.",
            "관리자는 커뮤니티 운영, 참가 검증, 부정 이용 방지를 위해 필요한 범위에서 데이터를 확인할 수 있습니다.",
            "Riot API 연동 기능은 운영 설정과 승인 범위에 따라 단계적으로 제공됩니다.",
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
          title: "계정과 데이터",
          items: [
            "회원은 정확한 본인·Riot 계정 정보를 제공하고 계정 접근 정보를 안전하게 관리해야 합니다.",
            "가입 계정은 운영자 승인 후 일부 기능을 이용할 수 있으며, 탈퇴·삭제 요청은 개인정보처리방침의 절차를 따릅니다.",
            "경기 결과와 운영 기록의 정정이 필요한 경우 근거와 함께 운영진에게 요청할 수 있습니다.",
          ],
        },
        {
          title: "서비스 변경과 중단",
          items: [
            "점검, 보안 사고 대응, 외부 API 제한 또는 불가항력 사유로 서비스 일부가 일시 중단될 수 있습니다.",
            "이용자에게 중요한 기능·정책 변경은 가능한 범위에서 사전에 사이트로 알립니다.",
            "운영 종료 시 계정과 개인정보의 처리·삭제 계획을 별도로 안내합니다.",
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
