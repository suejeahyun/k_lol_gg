import { NextResponse } from "next/server";
import type { SiteFeatureKey } from "@/lib/site/settings";
import { getSiteFeatureLabel, getSiteSettings, isSiteFeatureEnabled } from "@/lib/site/settings";

export async function requireSiteFeature(feature: SiteFeatureKey) {
  const settings = await getSiteSettings();

  if (isSiteFeatureEnabled(settings, feature)) return null;

  const label = getSiteFeatureLabel(feature);

  return NextResponse.json(
    {
      ok: false,
      error: "PREMIUM_FEATURE_LOCKED",
      feature,
      featureLabel: label,
      siteName: settings.siteName,
      message: `${label} 기능은 현재 이 사이트에서 비활성화되어 있습니다.`,
    },
    { status: 402 },
  );
}
