import type { ReactNode } from "react";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import PremiumLockedPreview from "@/components/PremiumLockedPreview";
import { getSiteSettings } from "@/lib/site/settings";

type AdminBalanceAiLayoutProps = {
  children: ReactNode;
};

export default async function AdminBalanceAiLayout({ children }: AdminBalanceAiLayoutProps) {
  const siteSettings = await getSiteSettings();

  return (
    <PremiumFeatureGate
      feature="balanceAi"
      settings={siteSettings}
      lockedPreview={
        <PremiumLockedPreview
          eyebrow="ADMIN · K-LOL RANKING"
          title="Balance AI 관리"
          description="K-LOL 랭킹과 AI 리뷰 관리 기능은 방별 프리미엄 설정에서 활성화할 수 있습니다."
          items={[
            { label: "AI 리뷰", value: "잠금" },
            { label: "재계산", value: "잠금" },
            { label: "MMR 프로필", value: "잠금" },
          ]}
        />
      }
      renderLockedContent={false}
    >
      {children}
    </PremiumFeatureGate>
  );
}
