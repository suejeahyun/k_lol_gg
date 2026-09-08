import type { Metadata } from "next";
import Link from "next/link";
import { LogIn, Scale, Sparkles } from "lucide-react";

import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { readSiteFeatureState } from "@/modules/operations/infrastructure/site-feature-access";

import { TeamToolNav } from "../team-tool-nav";
import { TeamBalanceBuilder } from "./team-balance-builder";
import { TeamBalanceFeatureState } from "./team-balance-feature-state";
import styles from "../team-tools.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "팀 밸런스",
  description: "승인된 플레이어 10명의 포지션 선호와 경기 통계로 팀 후보를 계산합니다.",
  alternates: { canonical: "/tools/team-balance" },
};

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
          <p>10명의 가능한 라인과 최신 확정 경기 통계를 함께 보고, 가장 균형 잡힌 세 가지 배치를 계산해요.</p>
        </div>
        <Scale aria-hidden="true" />
      </section>

      <TeamToolNav current="balance" approved={approved} />

      {!approved ? (
        <section className={styles.emptyState} role="status">
          <LogIn aria-hidden="true" />
          <h2>승인된 계정으로 시작해 주세요</h2>
          <p>팀 초안은 계정 소유로 저장됩니다. 로그인과 승인이 끝나면 참가자를 선택할 수 있어요.</p>
          <Link className={styles.primaryLink} href="/login?next=%2Ftools%2Fteam-balance">로그인</Link>
        </section>
      ) : <TeamBalanceBuilder />}
    </div>
  );
}
