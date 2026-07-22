import type { Metadata } from "next";
import DestructionCoinTossPanel from "@/components/admin/DestructionCoinTossPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "코인토스",
  description: "내전과 멸망전 진행을 위한 K-LOL.GG 코인토스 도구입니다.",
  alternates: { canonical: "/coin-toss" },
};

export default function CoinTossPage() {
  return (
    <main className="page-container coin-toss-page">
      <section className="page-header coin-toss-hero">
        <div>
          <span className="section-eyebrow">PLAY TOOL</span>
          <h1>코인토스</h1>
        </div>
      </section>

      <DestructionCoinTossPanel className="destruction-coin-toss--standalone" />
    </main>
  );
}
