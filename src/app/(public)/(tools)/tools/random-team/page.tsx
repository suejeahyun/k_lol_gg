import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import { Dices } from "@/components/theme/theme-icons";

import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { TeamToolNav } from "../team-tool-nav";
import { RandomTeamTool } from "./random-team-tool";
import styles from "../team-tools.module.css";

export const metadata = createRouteMetadata("/tools/random-team");

export default async function RandomTeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const mode = (await searchParams).mode === "tier" ? "tier" : "random";
  const session = await getCurrentSession("ACCOUNT");
  const approved = session?.accountStatus === "APPROVED" && !session.mustChangePassword;

  return (
    <div className={`page-wrap ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="random-team-title">
        <div>

          <h1 id="random-team-title">랜덤·티어별 팀 나누기</h1>

        </div>
        <Dices aria-hidden="true" />
      </section>

      <TeamToolNav current="random" approved={approved} />

      <RandomTeamTool initialMode={mode} />
    </div>
  );
}
