import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import Link from "next/link";
import { LogIn, Scale, Sparkles } from "@/components/theme/theme-icons";

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
          <span className={styles.heroBadge}><Sparkles size={14} aria-hidden="true" /> FAIR TEAM LAB</span>
          <h1 id="team-balance-title">우리 팀, 근거 있게 나눠요</h1>
          <p>10명의 가능한 라인과 최신 확정 경기 통계를 함께 보고, 가장 균형 잡힌 팀 배치 한 가지를 계산해요.</p>
        </div>
        <Scale aria-hidden="true" />
      </section>

      <TeamToolNav current="balance" approved={approved} />

      {!approved ? (
        <section className={styles.emptyState} role="status">
          <LogIn aria-hidden="true" />
          <h2>승인된 계정으로 시작해 주세요</h2>
          <p>참가자 10명을 골라 실력과 포지션에 맞는 팀을 만듭니다. 신규 플레이어는 회원가입 후 바로 시작할 수 있으며, 기존 플레이어 연결은 관리자 확인이 필요합니다.</p>
          <Link className={styles.primaryLink} href={session ? "/account" : "/login?next=%2Ftools%2Fteam-balance"}>{session ? "내 계정 상태 확인" : "로그인"}</Link>
          {!session ? <Link href="/signup?next=%2Ftools%2Fteam-balance">회원가입 후 팀 만들기</Link> : null}
        </section>
      ) : <TeamBalanceBuilder />}
    </div>
  );
}
