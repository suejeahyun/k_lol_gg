import { redirect } from "next/navigation";
import TeamBalancePage from "@/components/team-balance/TeamBalancePage";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import PremiumLockedPreview from "@/components/PremiumLockedPreview";
import { requireApprovedUserOrAdmin } from "@/lib/auth/access";
import { getSiteSettings, isSiteFeatureEnabled } from "@/lib/site/settings";

export const dynamic = "force-dynamic";

async function requireAccessOrRedirect(nextPath: string) {
  try {
    await requireApprovedUserOrAdmin();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    }

    if (error instanceof Error && error.message === "NOT_APPROVED") {
      redirect("/me?status=not-approved");
    }

    throw error;
  }
}

export default async function UserTeamBalancePage() {
  await requireAccessOrRedirect("/players/balance");
  const siteSettings = await getSiteSettings();

  if (!isSiteFeatureEnabled(siteSettings, "balanceAi")) {
    return (
      <PremiumFeatureGate
        feature="balanceAi"
        settings={siteSettings}
        lockedPreview={
          <PremiumLockedPreview
            eyebrow="TEAM BALANCE"
            title="팀 밸런스"
            description="팀 밸런스와 K-LOL 랭킹 기반 추천은 방별 프리미엄 설정에서 활성화할 수 있습니다."
            items={[
              { label: "자동 계산", value: "잠금" },
              { label: "밴픽 추천", value: "잠금" },
              { label: "AI 탐색", value: "잠금" },
            ]}
          />
        }
        renderLockedContent={false}
      >
        <TeamBalancePage />
      </PremiumFeatureGate>
    );
  }

  return <TeamBalancePage />;
}
