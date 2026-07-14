import DestructionCoinTossPanel from "@/components/admin/DestructionCoinTossPanel";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";

export const dynamic = "force-dynamic";

export default function AppCoinTossPage() {
  return (
    <AppMobileShell title="코인토스" subtitle="선후공 도구">
      <section className="klol-app-section klol-app-coin-toss-section">
        <DestructionCoinTossPanel
          teamA={{ id: 1, name: "BLUE 팀" }}
          teamB={{ id: 2, name: "RED 팀" }}
          editableTeams
          className="destruction-coin-toss--app"
        />
      </section>
    </AppMobileShell>
  );
}
