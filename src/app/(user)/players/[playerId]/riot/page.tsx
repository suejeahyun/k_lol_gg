import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatGameDuration,
  formatKstDateTime,
  formatRiotPosition,
  formatRiotTier,
  getRiotPlayerAnalysis,
} from "@/lib/riot/player-analysis";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type PlayerRiotDetailPageProps = {
  params: Promise<{
    playerId: string;
  }>;
};

function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

export default async function PlayerRiotDetailPage({ params }: PlayerRiotDetailPageProps) {
  const { playerId } = await params;
  const id = Number(playerId);

  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  const analysis = await getRiotPlayerAnalysis(id);

  if (!analysis) {
    notFound();
  }

  const riotId = analysis.riotAccount
    ? `${analysis.riotAccount.gameName}#${analysis.riotAccount.tagLine}`
    : analysis.player.riotId;

  return (
    <div className={`page-shell ${styles.riotDetailPage}`}>
      <div className="page-header player-hero">
        <div>
          <p className="page-eyebrow">Riot 솔랭 분석</p>
          <h1 className="page-title">
            {analysis.player.name} ({analysis.player.nickname}#{analysis.player.tag})
          </h1>
          <p className="page-description">
            Riot 계정 연결, 솔로랭크, 최근 20게임, 라인/챔피언 지표를 분리해서 확인합니다.
          </p>
          <div className={styles.heroMeta}>
            <span className={`${styles.badge} ${analysis.riotAccount ? styles.badgeSuccess : styles.badgeWarn}`}>
              {analysis.riotAccount ? "Riot 연동됨" : "Riot 미연동"}
            </span>
            <span className={styles.badge}>{riotId}</span>
            <span className={styles.badge}>
              마지막 갱신: {formatKstDateTime(analysis.riotAccount?.lastSyncedAt)}
            </span>
          </div>
        </div>

        <div className="page-actions">
          <Link className="btn btn-ghost" href={`/players/${analysis.player.id}`}>
            플레이어 상세로
          </Link>
          <Link className="btn btn-primary" href="/me/riot">
            내 Riot 연동
          </Link>
        </div>
      </div>

      {!analysis.riotAccount ? (
        <section className="content-section player-panel">
          <div className="section-header">
            <h2>Riot 계정 연결 필요</h2>
          </div>
          <div className={styles.emptyState}>
            아직 Riot 계정이 연결되지 않았습니다. Production API 승인 후 본인 또는 관리자가 Riot ID를 연결하면 솔랭 분석이 표시됩니다.
          </div>
        </section>
      ) : null}

      <section className="content-section player-panel">
        <div className="section-header section-header--split">
          <div>
            <h2>솔랭 요약</h2>
            <p className="section-subtitle">저장된 Riot 캐시 데이터를 기준으로 표시합니다. 페이지 접속만으로 Riot API를 직접 호출하지 않습니다.</p>
          </div>
        </div>

        <div className={styles.panelGrid}>
          <article className={styles.metricCard}>
            <span>솔로랭크</span>
            <strong>
              {formatRiotTier(
                analysis.soloRank?.tier,
                analysis.soloRank?.rank,
                analysis.soloRank?.leaguePoints,
              )}
            </strong>
            <p>
              {analysis.soloRank
                ? `${analysis.soloRank.wins}승 ${analysis.soloRank.losses}패 · 승률 ${analysis.soloRank.winRate}%`
                : "랭크 스냅샷 없음"}
            </p>
          </article>

          <article className={styles.metricCard}>
            <span>최근 20게임</span>
            <strong>{analysis.recentSummary.winRate}%</strong>
            <p>{analysis.recentSummary.wins}승 {analysis.recentSummary.losses}패 · 총 {analysis.recentSummary.totalGames}게임</p>
          </article>

          <article className={styles.metricCard}>
            <span>평균 KDA</span>
            <strong>{analysis.recentSummary.averageKda}</strong>
            <p>{analysis.recentSummary.averageKills} / {analysis.recentSummary.averageDeaths} / {analysis.recentSummary.averageAssists}</p>
          </article>

          <article className={styles.metricCard}>
            <span>주 라인</span>
            <strong>{analysis.recentSummary.mainPosition?.label ?? "미정"}</strong>
            <p>
              {analysis.recentSummary.mainPosition
                ? `${analysis.recentSummary.mainPosition.games}게임 · 승률 ${analysis.recentSummary.mainPosition.winRate}%`
                : "최근 라인 데이터 없음"}
            </p>
          </article>

          <article className={styles.metricCard}>
            <span>평균 딜량</span>
            <strong>{formatNumber(analysis.recentSummary.averageDamage)}</strong>
            <p>최근 20게임 챔피언 대상 피해량</p>
          </article>

          <article className={styles.metricCard}>
            <span>평균 받은 피해</span>
            <strong>{formatNumber(analysis.recentSummary.averageTaken)}</strong>
            <p>최근 20게임 기준</p>
          </article>

          <article className={styles.metricCard}>
            <span>평균 시야</span>
            <strong>{analysis.recentSummary.averageVision}</strong>
            <p>visionScore 기준</p>
          </article>

          <article className={styles.metricCard}>
            <span>저장된 솔랭 경기</span>
            <strong>{analysis.allSoloMatchCount}</strong>
            <p>전체 모스트 계산 기준</p>
          </article>
        </div>
      </section>

      <div className={styles.twoColumn}>
        <section className="content-section player-panel">
          <div className="section-header">
            <h2>최근 라인 분포</h2>
          </div>

          {analysis.positionStats.length === 0 ? (
            <div className={styles.emptyState}>최근 라인 기록이 없습니다.</div>
          ) : (
            <div className={styles.positionList}>
              {analysis.positionStats.map((position, index) => (
                <article key={position.position} className={styles.rowCard}>
                  <span className={styles.rowRank}>{index + 1}</span>
                  <div className={styles.rowMain}>
                    <strong>{position.label}</strong>
                    <span>{position.games}게임 · {position.wins}승 {position.losses}패</span>
                  </div>
                  <div className={styles.rowNumber}>
                    <strong>{position.winRate}%</strong>
                    <span>평점 {position.kda}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="content-section player-panel">
          <div className="section-header">
            <h2>최근 챔피언 TOP 5</h2>
          </div>

          {analysis.recentChampions.length === 0 ? (
            <div className={styles.emptyState}>최근 챔피언 기록이 없습니다.</div>
          ) : (
            <div className={styles.championList}>
              {analysis.recentChampions.map((champion, index) => (
                <article key={champion.championId} className={styles.rowCard}>
                  <span className={styles.rowRank}>{index + 1}</span>
                  <div className={styles.rowMain}>
                    <strong>{champion.championNameKo}</strong>
                    <span>{champion.games}게임 · {champion.wins}승 {champion.losses}패</span>
                  </div>
                  <div className={styles.rowNumber}>
                    <strong>{champion.winRate}%</strong>
                    <span>평점 {champion.kda}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="content-section player-panel">
        <div className="section-header section-header--split">
          <div>
            <h2>전체 저장 기준 모스트 TOP 10</h2>
            <p className="section-subtitle">전체 갱신으로 저장된 솔랭 기록까지 포함합니다.</p>
          </div>
        </div>

        {analysis.mostChampions.length === 0 ? (
          <div className={styles.emptyState}>저장된 챔피언 기록이 없습니다.</div>
        ) : (
          <div className={styles.championList}>
            {analysis.mostChampions.map((champion, index) => (
              <article key={champion.championId} className={styles.rowCard}>
                <span className={styles.rowRank}>{index + 1}</span>
                <div className={styles.rowMain}>
                  <strong>{champion.championNameKo}</strong>
                  <span>{champion.games}게임 · {champion.wins}승 {champion.losses}패 · {champion.averageKills} / {champion.averageDeaths} / {champion.averageAssists}</span>
                </div>
                <div className={styles.rowNumber}>
                  <strong>{champion.winRate}%</strong>
                  <span>평점 {champion.kda}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="content-section player-panel">
        <div className="section-header section-header--split">
          <div>
            <h2>최근 솔랭 20게임</h2>
            <p className="section-subtitle">매치 상세는 DB에 저장된 캐시 기준입니다.</p>
          </div>
        </div>

        {analysis.recentMatches.length === 0 ? (
          <div className={styles.emptyState}>최근 솔랭 기록이 없습니다.</div>
        ) : (
          <div className={styles.matchList}>
            {analysis.recentMatches.map((match) => (
              <article
                key={match.id}
                className={`${styles.matchCard} ${match.win ? styles.matchWin : styles.matchLoss}`}
              >
                <div className={styles.matchResult}>
                  <strong>{match.win ? "승리" : "패배"}</strong>
                  <span>{formatKstDateTime(match.gameCreation)}</span>
                  <small>{formatGameDuration(match.gameDuration)}</small>
                </div>
                <div className={styles.matchChampion}>
                  <strong>{match.championNameKo}</strong>
                  <span>{formatRiotPosition(match.position)}</span>
                </div>
                <div className={styles.matchKda}>
                  <strong>{match.kills} / {match.deaths} / {match.assists}</strong>
                  <span>평점 {match.kda}</span>
                </div>
                <div className={styles.matchExtra}>
                  <strong>{formatNumber(match.totalDamageDealtToChampions)}</strong>
                  <span>딜량 · 받은 피해 {formatNumber(match.totalDamageTaken)} · 시야 {match.visionScore}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
