export const dynamic = "force-dynamic";

import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import { getSiteSettings } from "@/lib/site/settings";
import KakaoSearchClient from "./KakaoSearchClient";

export default async function KakaoPage() {
  const siteSettings = await getSiteSettings();

  return (
    <PremiumFeatureGate feature="kakao" settings={siteSettings}>
      <KakaoSearchClient />
    </PremiumFeatureGate>
  );
}
