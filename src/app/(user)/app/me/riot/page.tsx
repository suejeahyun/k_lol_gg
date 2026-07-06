import type { Metadata } from "next";
import RiotAccountManager from "@/components/riot/RiotAccountManager";

export const metadata: Metadata = {
  title: "APP Riot 계정 연동",
};

export default function AppMeRiotPage() {
  return (
    <RiotAccountManager
      mode="me"
      eyebrow="K-LOL.GG APP"
      title="앱 Riot 계정 연동"
      description="모바일 앱 화면에서 Riot ID 연결 상태와 솔랭 캐시를 확인합니다. Production API 승인 후 동일한 서버 보안 구조로 연결 기능을 엽니다."
      compact
    />
  );
}
