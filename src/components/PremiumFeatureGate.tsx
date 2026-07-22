import Link from "next/link";
import type { ReactNode } from "react";
import type { SiteFeatureKey, SiteSettings } from "@/lib/site/settings";
import { getSiteFeatureLabel, isSiteFeatureEnabled } from "@/lib/site/settings";

type PremiumFeatureGateProps = {
  feature: SiteFeatureKey;
  settings: SiteSettings;
  children: ReactNode;
  adminHref?: string;
  lockedPreview?: ReactNode;
  renderLockedContent?: boolean;
};

export default function PremiumFeatureGate({
  feature,
  settings,
  children,
  adminHref = "/admin/site-settings",
  lockedPreview,
  renderLockedContent = true,
}: PremiumFeatureGateProps) {
  const enabled = isSiteFeatureEnabled(settings, feature);

  if (enabled) return <>{children}</>;

  const label = getSiteFeatureLabel(feature);
  const content = lockedPreview ?? (renderLockedContent ? children : null);

  return (
    <div className="premium-feature-gate" role="region" aria-label={`${label} 유료 기능 잠금`}>
      {content ? (
        <div className="premium-feature-gate__content" aria-hidden="true">
          {content}
        </div>
      ) : null}
      <div className="premium-feature-gate__overlay">
        <span className="premium-feature-gate__badge">PREMIUM</span>
        <h2>{settings.premiumNoticeTitle}</h2>
        <p>
          {settings.siteName}의 <strong>{label}</strong> 기능은 현재 비활성화되어 있습니다.
          {" "}
          {settings.premiumNoticeMessage}
        </p>
        {settings.supportContact ? <small>문의: {settings.supportContact}</small> : null}
        <Link className="premium-feature-gate__action" href={adminHref}>
          사이트 설정 열기
        </Link>
      </div>
    </div>
  );
}
