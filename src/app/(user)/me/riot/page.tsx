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
      description="닉네임#태그로 Riot 계정을 검증하고 솔랭 데이터를 동기화합니다. 동기화가 완료되면 현재 티어가 플레이어 정보와 팀 밸런스에 자동 반영됩니다."
    />
  );
}
