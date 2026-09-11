import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Crown, Gamepad2, Medal, Sparkles, Trophy, UsersRound } from "lucide-react";

import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { isStatisticsUuid } from "@/modules/statistics/application/statistics-query";
import { buildPublicRankingView, isPublicRankingView, publicRankingViewDefinition, publicRankingViewDefinitions } from "@/modules/statistics/domain/public-ranking-view";
import { loadRuntimeStatisticsData } from "@/modules/statistics/infrastructure/runtime-statistics-data";

import styles from "./rankings.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "시즌 랭킹",
  description: "K-LOL.GG 시즌별 승률, 참여 횟수와 MVP 랭킹을 확인합니다.",
  alternates: { canonical: "/rankings" },
};

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const requestedSeason = typeof raw.seasonId === "string" && isStatisticsUuid(raw.seasonId)
    ? raw.seasonId
    : null;
  const minimumText = typeof raw.minParticipation === "string" ? raw.minParticipation : "10";
  const minimumParticipation = /^(?:0|[1-9][0-9]{0,2})$/.test(minimumText)
    ? Math.min(999, Number(minimumText))
    : 10;
  const requestedView = isPublicRankingView(raw.view) ? raw.view : "win-rate";
  const session = await getCurrentSession("ACCOUNT");
  const result = await loadRuntimeStatisticsData(async (service) => {
    const [seasons, ranking, ownPlayerId] = await Promise.all([
      service.listPublicSeasons(),
      service.getPublicSeasonRanking(requestedSeason, minimumParticipation),
      session?.purpose === "ACCOUNT"
        ? service.findPublicPlayerIdForAccount(session.userId)
        : Promise.resolve(null),
    ]);
    return { seasons, ranking, ownPlayerId };
  });
  const selectedView = publicRankingViewDefinition(requestedView);
  const rankedRows = result.state === "ready"
    ? buildPublicRankingView(result.data.ranking.rankings, requestedView)
    : [];

  return (
    <div className={`page-wrap ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="ranking-title">
        <div>
          <p>SEASON RANKING</p>
          <h1 id="ranking-title">함께 쌓은 시즌 기록</h1>
          <span>공개 경기만 반영한 승률·참여·MVP를 같은 기준으로 비교해요.</span>
        </div>
        <Trophy aria-hidden="true" />
      </section>

      {result.state === "ready" ? (
        <>
          <form className={styles.filters} action="/rankings" method="get">
            <input type="hidden" name="view" value={requestedView} />
            <label>시즌<select name="seasonId" defaultValue={result.data.ranking.season?.id ?? ""}>
              {result.data.seasons.length === 0 ? <option value="">선택 가능한 시즌 없음</option> : null}
              {result.data.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}{season.status === "ACTIVE" ? " · 진행 중" : ""}</option>)}
            </select></label>
            <label>최소 참여<input name="minParticipation" type="number" min="0" max="999" defaultValue={minimumParticipation} /></label>
            <button type="submit">기준 적용</button>
            <Link className={styles.mmrLink} href="/rankings/mmr">MMR 랭킹 <ArrowRight size={16} aria-hidden="true" /></Link>
          </form>

          {result.data.ranking.season === null ? (
            <section className={styles.state}><Sparkles /><h2>공개할 시즌이 아직 없어요.</h2><p>활성 또는 종료 시즌이 준비되면 랭킹을 확인할 수 있습니다.</p></section>
          ) : result.data.ranking.projection?.status !== "READY" ? (
            <section className={styles.state}><Gamepad2 /><h2>이 시즌 통계를 준비하고 있어요.</h2><p>경기 집계가 끝나면 자동으로 표시됩니다.</p></section>
          ) : result.data.ranking.rankings.length === 0 ? (
            <section className={styles.state}><UsersRound /><h2>랭킹 기준을 충족한 플레이어가 없어요.</h2><p>현재 기준은 시즌 참여 {minimumParticipation}회 이상입니다.</p></section>
          ) : (
            <>
              <section className={styles.summary} aria-label="시즌 집계 요약">
                <article><span>공개 경기</span><strong>{result.data.ranking.projection.sourceMatchCount}</strong></article>
                <article><span>집계 게임</span><strong>{result.data.ranking.projection.sourceGameCount}</strong></article>
                <article><span>랭킹 인원</span><strong>{result.data.ranking.rankings.length}</strong></article>
              </section>
              <nav className={styles.tabs} aria-label="랭킹 분류">
                {publicRankingViewDefinitions.map((view) => {
                  const params = new URLSearchParams({ minParticipation: String(minimumParticipation), view: view.id });
                  if (result.data.ranking.season) params.set("seasonId", result.data.ranking.season.id);
                  return <Link key={view.id} href={`/rankings?${params}`} aria-current={view.id === requestedView ? "page" : undefined}>{view.label}</Link>;
                })}
              </nav>
              <section className={styles.explanation} aria-label="랭킹 기준 안내"><strong>{selectedView.label}</strong><span>{selectedView.description}입니다. 최소 참여 {minimumParticipation}회인 공개 경기만 반영합니다. {selectedView.tieBreakDescription}.</span></section>
              <section className={styles.podium} aria-label={`상위 ${selectedView.label} 랭킹`}>
                {rankedRows.slice(0, 3).map((row, index) => (
                  <Link key={row.playerId} href={`/players/${row.playerId}`} data-rank={index + 1}>
                    {index === 0 ? <Crown aria-hidden="true" /> : <Medal aria-hidden="true" />}
                    <span>{index + 1}위</span><strong>{row.displayName}</strong><small>{row.riotId}</small>
                    <b>{selectedView.metric(row)}</b><small>{row.wins}승 {row.losses}패 · 참여 {row.participationCount}회 · MVP {row.mvpCount}회</small>
                  </Link>
                ))}
              </section>
              <section className={styles.board} aria-labelledby="ranking-board-title">
                <header><div><span>LEADERBOARD</span><h2 id="ranking-board-title">{selectedView.label} 전체 순위</h2></div><p>{selectedView.tieBreakDescription}</p></header>
                <ol>
                  {rankedRows.map((row, index) => (
                    <li key={row.playerId} data-own={row.playerId === result.data.ownPlayerId ? "true" : "false"}>
                      <b>{index + 1}</b>
                      <Link href={`/players/${row.playerId}`}><strong>{row.displayName}</strong><small>{row.riotId}</small></Link>
                      <span><small>{selectedView.metricLabel}</small><strong>{selectedView.metric(row)}</strong></span>
                      <span><small>참여</small><strong>{row.participationCount}회</strong></span>
                      <span><small>전적</small><strong>{row.wins}승 {row.losses}패</strong></span>
                      <span><small>MVP</small><strong>{row.mvpCount}회</strong></span>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </>
      ) : result.state === "unavailable" ? (
        <section className={styles.state} role="status"><Sparkles /><h2>랭킹 집계 환경을 준비하고 있어요.</h2><p>준비가 끝나면 승률·참여·MVP 순위를 확인할 수 있습니다.</p></section>
      ) : (
        <section className={styles.state} role="alert"><Sparkles /><h2>랭킹을 불러오지 못했어요.</h2><p>잠시 후 다시 시도해 주세요.</p></section>
      )}
    </div>
  );
}
