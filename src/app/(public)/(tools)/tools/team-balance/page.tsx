import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import Link from "next/link";
import { LogIn, Scale } from "@/components/theme/theme-icons";

import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { readSiteFeatureState } from "@/modules/operations/infrastructure/site-feature-access";

import { TeamToolNav } from "../team-tool-nav";
import { TeamBalanceBuilder } from "./team-balance-builder";
import { TeamBalanceFeatureState } from "./team-balance-feature-state";
import styles from "../team-tools.module.css";

export const dynamic = "force-dynamic";
export const metadata = createRouteMetadata("/tools/team-balance");

export default async function TeamBalancePage() {
  const featureState = await readSiteFeatureState("teamBalance");
  if (featureState !== "enabled") return <TeamBalanceFeatureState state={featureState} />;
  const session = await getCurrentSession("ACCOUNT");
  const approved = session?.accountStatus === "APPROVED" && !session.mustChangePassword;

  return (
    <div className={`page-wrap ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="team-balance-title">
        <div>

          <h1 id="team-balance-title">실력·포지션으로 팀 나누기</h1>

        </div>
        <Scale aria-hidden="true" />
      </section>

      <TeamToolNav current="balance" approved={approved} />

      {!approved ? (
        <section className={styles.emptyState} role="status">
          <LogIn aria-hidden="true" />
          <h2>승인된 계정으로 시작해 주세요</h2>

          <Link className={styles.primaryLink} href={session ? "/account" : "/login?next=%2Ftools%2Fteam-balance"}>{session ? "내 계정 상태 확인" : "로그인"}</Link>
          {!session ? <Link href="/signup?next=%2Ftools%2Fteam-balance">회원가입 후 팀 만들기</Link> : null}
        </section>
      ) : <TeamBalanceBuilder />}
    </div>
  );
}
