import { redirect } from "next/navigation";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import { getSiteSettings, isSiteFeatureEnabled } from "@/lib/site/settings";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ draftId: string }> };

export default async function UserBalanceDraftDetailPage({ params }: Props) {
  const siteSettings = await getSiteSettings();
  if (!isSiteFeatureEnabled(siteSettings, "balanceAi")) {
    return (
      <PremiumFeatureGate feature="balanceAi" settings={siteSettings} renderLockedContent={false}>
        <div />
      </PremiumFeatureGate>
    );
  }

  const { draftId } = await params;
  redirect(`/players/balance/recommendations?draftId=${draftId}&team=RED`);
}
