import type { Metadata } from "next";
import DestructionCoinTossPanel from "@/components/admin/DestructionCoinTossPanel";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "모바일 코인토스",
  description: "K-LOL.GG 코인토스 도구를 모바일에서 사용하세요.",
};

export default function AppCoinTossPage() {
  return (
    <AppMobileShell title="코인토스" subtitle="앞면·뒷면 도구">
      <section className="klol-app-section klol-app-coin-toss-section">
        <DestructionCoinTossPanel
          className="destruction-coin-toss--app"
          headingLevel="h1"
        />
      </section>
    </AppMobileShell>
  );
}
