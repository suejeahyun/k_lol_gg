import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Dices, Sparkles } from "lucide-react";

import { CoinTossTool } from "./coin-toss-tool";
import styles from "../team-tools.module.css";

export const metadata: Metadata = {
  title: "코인 토스",
  description: "앞면과 뒷면 중 하나를 공정하게 무작위로 뽑습니다.",
  alternates: { canonical: "/tools/coin-toss" },
};

export default function CoinTossPage() {
  return (
    <div className={`page-wrap ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="coin-toss-title">
        <div>
          <span className={styles.heroBadge}><Sparkles size={14} aria-hidden="true" /> LUCKY MOMENT</span>
          <h1 id="coin-toss-title">가볍게 톡, 결정 완료!</h1>
          <p>진영이나 선픽처럼 고민되는 순간, 코인을 던져 앞면과 뒷면 중 하나를 골라요.</p>
        </div>
        <Coins aria-hidden="true" />
      </section>

      <nav className={styles.toolNav} aria-label="팀 도구">
        <Link href="/tools/random-team"><Dices size={17} aria-hidden="true" /> 랜덤 팀</Link>
        <Link href="/tools/coin-toss" data-active="true"><Coins size={17} aria-hidden="true" /> 코인 토스</Link>
      </nav>

      <CoinTossTool />
    </div>
  );
}
