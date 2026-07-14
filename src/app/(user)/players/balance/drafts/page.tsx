import { redirect } from "next/navigation";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import { getSiteSettings, isSiteFeatureEnabled } from "@/lib/site/settings";

export const dynamic = "force-dynamic";

export default async function UserBalanceDraftsPage() {
  const siteSettings = await getSiteSettings();
  if (!isSiteFeatureEnabled(siteSettings, "balanceAi")) {
    return (
      <PremiumFeatureGate feature="balanceAi" settings={siteSettings} renderLockedContent={false}>
        <div />
      </PremiumFeatureGate>
    );
  }

  redirect("/players/balance/recommendations");
}
