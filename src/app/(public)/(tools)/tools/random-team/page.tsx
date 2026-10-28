import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import { Dices } from "@/components/theme/theme-icons";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { isRuntimeCommunityModuleEnabled } from "@/modules/community-sites/infrastructure/module-access";

import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { TeamToolNav } from "../team-tool-nav";
import { RandomTeamTool } from "./random-team-tool";
import { TeamBalanceFeatureState } from "../team-balance/team-balance-feature-state";
import styles from "../team-tools.module.css";

export const metadata = createRouteMetadata("/tools/random-team");
export const dynamic = "force-dynamic";

export default async function RandomTeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (SERVICE_BRAND.id === "community") {
    const enabled = await isRuntimeCommunityModuleEnabled("teamBalance").catch(() => null);
    if (enabled !== true) return <TeamBalanceFeatureState state={enabled === false ? "disabled" : "unavailable"} />;
  }
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
