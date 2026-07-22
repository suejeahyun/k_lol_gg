import type { Metadata } from "next";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { getSiteSettings } from "@/lib/site/settings";
import RandomTeamClient from "../../(user)/random-team/RandomTeamClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "모바일 랜덤 팀 나누기",
  description: "10명의 이름을 모바일에서 RED·BLUE 두 팀으로 빠르게 나누세요.",
};

export default async function AppRandomTeamPage() {
  const settings = await getSiteSettings();

  return (
    <AppMobileShell title="랜덤 팀" subtitle="10인 팀 나누기">
      <PremiumFeatureGate feature="randomTeam" settings={settings}>
        <RandomTeamClient embedded />
      </PremiumFeatureGate>
    </AppMobileShell>
  );
}
