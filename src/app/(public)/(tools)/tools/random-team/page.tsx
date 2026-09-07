import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Dices, Sparkles } from "lucide-react";

import { RandomTeamTool } from "./random-team-tool";
import styles from "../team-tools.module.css";

export const metadata: Metadata = {
  title: "랜덤 팀 나누기",
  description: "10명의 참가자를 무작위 또는 티어 점수 균형으로 5명씩 나눕니다.",
  alternates: { canonical: "/tools/random-team" },
};

export default async function RandomTeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const mode = (await searchParams).mode === "tier" ? "tier" : "random";

  return (
    <div className={`page-wrap ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="random-team-title">
        <div>
          <span className={styles.heroBadge}><Sparkles size={14} aria-hidden="true" /> TEAM PLAYGROUND</span>
          <h1 id="random-team-title">10명이면, 팀 완성!</h1>
          <p>이름만 붙여 넣으면 무작위로 섞거나 1~10점 티어 차이가 가장 작도록 두 팀을 만들어요.</p>
        </div>
        <Dices aria-hidden="true" />
      </section>

      <nav className={styles.toolNav} aria-label="팀 도구">
        <Link href="/tools/random-team" data-active="true"><Dices size={17} aria-hidden="true" /> 랜덤 팀</Link>
        <Link href="/tools/coin-toss"><Coins size={17} aria-hidden="true" /> 코인 토스</Link>
      </nav>

      <RandomTeamTool initialMode={mode} />
    </div>
  );
}
