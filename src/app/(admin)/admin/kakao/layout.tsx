import type { ReactNode } from "react";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import PremiumLockedPreview from "@/components/PremiumLockedPreview";
import { getSiteSettings } from "@/lib/site/settings";

type AdminKakaoLayoutProps = {
  children: ReactNode;
};

export default async function AdminKakaoLayout({ children }: AdminKakaoLayoutProps) {
  const siteSettings = await getSiteSettings();

  return (
    <PremiumFeatureGate
      feature="kakao"
      settings={siteSettings}
      lockedPreview={
        <PremiumLockedPreview
          eyebrow="ADMIN · KAKAO"
          title="카카오톡 운영"
          description="카카오톡 오픈채팅 자동화와 관련 운영 기능은 방별 프리미엄 설정에서 활성화할 수 있습니다."
          items={[
            { label: "구인 자동화", value: "잠금" },
            { label: "운영 신청", value: "잠금" },
            { label: "로그/통계", value: "잠금" },
          ]}
        />
      }
      renderLockedContent={false}
    >
      {children}
    </PremiumFeatureGate>
  );
}
