import Link from "next/link";

import type { TeamBalanceRecommendationDto, TeamBalanceTeam } from "@/modules/team-tools";

import styles from "../../team-tools.module.css";

const positionLabel = { TOP: "탑", JGL: "정글", MID: "미드", ADC: "원딜", SUP: "서포터" } as const;

function percent(basisPoints: number) {
  return `${(basisPoints / 100).toFixed(1)}%`;
}

function score(basisPoints: number) {
  return (basisPoints / 100).toFixed(1);
}

function reasonLabel(reason: TeamBalanceRecommendationDto["bans"][number]["reasonCode"]) {
  return reason === "HIGH_MASTERY" ? "숙련도 우선" : reason === "HIGH_SAMPLE" ? "누적 표본 우선" : "표본 확인 필요";
}

export function TeamBalanceRecommendationsPanel({
  recommendation,
  hrefForTeam,
}: {
  recommendation: TeamBalanceRecommendationDto;
  hrefForTeam: (team: TeamBalanceTeam) => string;
}) {
  if (recommendation.state === "NO_SELECTION") {
    return <section className={styles.emptyState} role="status"><h2>추천할 팀 배치를 먼저 선택해 주세요</h2><p>자동 후보 또는 수동 배치를 선택하면 해당 팀을 기준으로 픽과 상대 밴 후보를 계산합니다.</p></section>;
  }
  if (recommendation.state === "NO_PROJECTION") {
    return <section className={styles.emptyState} role="status"><h2>챔피언 통계를 준비하고 있어요</h2><p>아직 추천에 필요한 시즌 기록이 충분하지 않아요.</p></section>;
  }

  return <section className={styles.recommendationBoard} aria-labelledby="recommendation-title">
    <header className={styles.recommendationHeader}>
      <div><span>PICK · BAN</span><h2 id="recommendation-title">{recommendation.team} 팀 밴픽 추천</h2><p>{recommendation.projection?.seasonName} · 챔피언 기록 {recommendation.summary.championStatRowCount}개 분석</p></div>
      <nav className={styles.teamSwitch} aria-label="추천 기준 팀">
        {(["RED", "BLUE"] as const).map((team) => <Link key={team} aria-current={recommendation.team === team ? "page" : undefined} data-team={team} href={hrefForTeam(team)}>{team} 기준</Link>)}
      </nav>
    </header>

    <div className={styles.pickGrid}>
      {recommendation.picks.map((pick) => <article className={styles.pickCard} key={pick.playerId}>
        <header><span>{positionLabel[pick.position]}</span><strong>{pick.displayName}</strong></header>
        {pick.champions.length > 0 ? <ol>{pick.champions.map((champion, index) => <li key={champion.championKey}>
          <b>{index + 1}</b><div><strong>{champion.championName}</strong><small>{champion.games}판 · 승률 {percent(champion.winRateBp)} · MVP {champion.mvpCount}</small></div><em>{score(champion.scoreBp)}</em>
        </li>)}</ol> : <p>이 시즌의 활성 챔피언 기록이 없습니다.</p>}
      </article>)}
    </div>

    <section className={styles.banSection} aria-labelledby="ban-title">
      <header><span>{recommendation.opponentTeam} TEAM</span><h3 id="ban-title">상대 밴 후보</h3><p>같은 챔피언은 가장 위협도가 높은 상대 한 명만 남깁니다.</p></header>
      {recommendation.bans.length > 0 ? <ol className={styles.banGrid}>{recommendation.bans.map((ban, index) => <li key={ban.championKey}>
        <b>#{index + 1}</b><div><strong>{ban.championName}</strong><span>{positionLabel[ban.targetPosition]} · {ban.targetDisplayName}</span><small>{ban.games}판 · 승률 {percent(ban.winRateBp)} · {reasonLabel(ban.reasonCode)}</small></div><em>{score(ban.priorityBp)}</em>
      </li>)}</ol> : <p className={styles.recommendationEmpty}>상대 팀에서 추천할 활성 챔피언 기록이 없습니다.</p>}
    </section>
  </section>;
}
