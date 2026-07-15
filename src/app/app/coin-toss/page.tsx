import DestructionCoinTossPanel from "@/components/admin/DestructionCoinTossPanel";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";

export const dynamic = "force-dynamic";

export default function AppCoinTossPage() {
  return (
    <AppMobileShell title="코인토스" subtitle="앞면·뒷면 도구">
      <section className="klol-app-section klol-app-coin-toss-section">
        <DestructionCoinTossPanel className="destruction-coin-toss--app" />
      </section>
    </AppMobileShell>
  );
}
