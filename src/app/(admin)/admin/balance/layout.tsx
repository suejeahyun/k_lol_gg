import type { ReactNode } from "react";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import PremiumLockedPreview from "@/components/PremiumLockedPreview";
import { getSiteSettings } from "@/lib/site/settings";

type AdminBalanceLayoutProps = {
  children: ReactNode;
};

export default async function AdminBalanceLayout({ children }: AdminBalanceLayoutProps) {
  const siteSettings = await getSiteSettings();

  return (
    <PremiumFeatureGate
      feature="balanceAi"
      settings={siteSettings}
      lockedPreview={
        <PremiumLockedPreview
          eyebrow="ADMIN · BALANCE"
          title="팀 밸런스 관리"
          description="팀 밸런스 관리 기능은 방별 프리미엄 설정에서 활성화할 수 있습니다."
          items={[
            { label: "계산", value: "잠금" },
            { label: "드래프트", value: "잠금" },
            { label: "추천", value: "잠금" },
          ]}
        />
      }
      renderLockedContent={false}
    >
      {children}
    </PremiumFeatureGate>
  );
}
