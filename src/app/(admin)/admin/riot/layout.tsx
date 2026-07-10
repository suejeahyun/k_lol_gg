import type { ReactNode } from "react";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import PremiumLockedPreview from "@/components/PremiumLockedPreview";
import { getSiteSettings } from "@/lib/site/settings";

export const dynamic = "force-dynamic";

type AdminRiotLayoutProps = {
  children: ReactNode;
};

export default async function AdminRiotLayout({ children }: AdminRiotLayoutProps) {
  const settings = await getSiteSettings();

  return (
    <PremiumFeatureGate
      feature="riot"
      settings={settings}
      lockedPreview={
        <PremiumLockedPreview
          eyebrow="ADMIN RIOT PREMIUM"
          title="Riot 연동 관리"
          description="Riot 계정 목록, 일괄 연결, 솔랭 동기화, API 로그 관리는 방별 유료 기능입니다."
          items={[
            { label: "관리 범위", value: "계정/동기화/API" },
            { label: "권한", value: "슈퍼어드민 설정" },
            { label: "상태", value: "방별 잠금" },
          ]}
        />
      }
      renderLockedContent={false}
    >
      {children}
    </PremiumFeatureGate>
  );
}
