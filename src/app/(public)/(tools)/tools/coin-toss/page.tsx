import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import { Coins } from "@/components/theme/theme-icons";

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

          <h1 id="coin-toss-title">코인 던지기</h1>

        </div>
        <Coins aria-hidden="true" />
      </section>

      <TeamToolNav current="coin" approved={approved} />

      <CoinTossTool />
    </div>
  );
}
