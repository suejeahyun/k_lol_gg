import DestructionCoinTossPanel from "@/components/admin/DestructionCoinTossPanel";

export const dynamic = "force-dynamic";

export default function CoinTossPage() {
  return (
    <main className="page-container coin-toss-page">
      <section className="page-header coin-toss-hero">
        <div>
          <span className="section-eyebrow">PLAY TOOL</span>
          <h1>코인토스</h1>
        </div>
      </section>

      <DestructionCoinTossPanel
        teamA={{ id: 1, name: "BLUE 팀" }}
        teamB={{ id: 2, name: "RED 팀" }}
        editableTeams
        className="destruction-coin-toss--standalone"
      />
    </main>
  );
}
