import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import { Coins, Sparkles } from "lucide-react";

import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { TeamToolNav } from "../team-tool-nav";
import { CoinTossTool } from "./coin-toss-tool";
import styles from "../team-tools.module.css";

export const metadata = createRouteMetadata("/tools/coin-toss");

export default async function CoinTossPage() {
  const session = await getCurrentSession("ACCOUNT");
  const approved = session?.accountStatus === "APPROVED" && !session.mustChangePassword;
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

      <TeamToolNav current="coin" approved={approved} />

      <CoinTossTool />
    </div>
  );
}
