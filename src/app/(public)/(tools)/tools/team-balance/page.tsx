import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Dices, LogIn, Scale, Sparkles } from "lucide-react";

import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { loadRuntimePlayerCatalog } from "@/modules/players/infrastructure/runtime-player-data";

import { TeamBalanceBuilder } from "./team-balance-builder";
import styles from "../team-tools.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "팀 밸런스",
  description: "승인된 플레이어 10명의 포지션 선호와 경기 통계로 팀 후보를 계산합니다.",
  alternates: { canonical: "/tools/team-balance" },
};

export default async function TeamBalancePage() {
  const session = await getCurrentSession("ACCOUNT");
  const approved = session?.accountStatus === "APPROVED" && !session.mustChangePassword;
  const catalog = approved
    ? await loadRuntimePlayerCatalog({ query: "", page: 1, pageSize: 50 })
    : null;

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

      <nav className={styles.toolNav} aria-label="팀 도구">
        <Link href="/tools/team-balance" data-active="true"><Scale size={17} aria-hidden="true" /> 팀 밸런스</Link>
        <Link href="/tools/random-team"><Dices size={17} aria-hidden="true" /> 랜덤 팀</Link>
        <Link href="/tools/coin-toss"><Coins size={17} aria-hidden="true" /> 코인 토스</Link>
      </nav>

      {!approved ? (
        <section className={styles.emptyState} role="status">
          <LogIn aria-hidden="true" />
          <h2>승인된 계정으로 시작해 주세요</h2>
          <p>팀 초안은 계정 소유로 저장됩니다. 로그인과 승인이 끝나면 참가자를 선택할 수 있어요.</p>
          <Link className={styles.primaryLink} href="/login?next=%2Ftools%2Fteam-balance">로그인</Link>
        </section>
      ) : catalog?.state === "ready" ? (
        <TeamBalanceBuilder players={catalog.data.items.map((player) => ({ id: player.id, label: `${player.displayName} · ${player.riotId}` }))} />
      ) : (
        <section className={styles.emptyState} role={catalog?.state === "error" ? "alert" : "status"}>
          <Scale aria-hidden="true" />
          <h2>플레이어 목록을 불러올 수 없어요</h2>
          <p>V2 PostgreSQL과 공개 플레이어 등록부가 연결된 뒤 다시 시도해 주세요.</p>
        </section>
      )}
    </div>
  );
}
