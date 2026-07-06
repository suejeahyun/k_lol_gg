import type { Metadata } from "next";
import RiotAccountManager from "@/components/riot/RiotAccountManager";

export const metadata: Metadata = {
  title: "Riot 계정 연동",
};

export default function MeRiotPage() {
  return (
    <RiotAccountManager
      mode="me"
      eyebrow="MY RIOT ACCOUNT"
      title="Riot 계정 연동"
      description="내 K-LOL.GG 플레이어와 Riot ID를 연결하는 화면입니다. Production API 승인 전에는 실제 연결 호출이 차단되며, 승인 후 서버 검증 방식으로 활성화됩니다."
    />
  );
}
