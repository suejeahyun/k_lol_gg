import Link from "next/link";
import { notFound } from "next/navigation";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import PremiumLockedPreview from "@/components/PremiumLockedPreview";
import { getSiteSettings, isSiteFeatureEnabled } from "@/lib/site/settings";
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

const DDRAGON_VERSION = "15.24.1";

function getChampionImageUrl(championName: string) {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${championName}.png`;
}

function getShare(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(6, Math.round((value / max) * 100));
}

export default async function PlayerRiotDetailPage({ params }: PlayerRiotDetailPageProps) {
  const { playerId } = await params;
  const id = Number(playerId);
  const settings = await getSiteSettings();

  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  if (!isSiteFeatureEnabled(settings, "riot")) {
    return (
      <PremiumFeatureGate
        feature="riot"
        settings={settings}
        lockedPreview={
          <PremiumLockedPreview
            eyebrow="RIOT ANALYSIS PREMIUM"
            title="Riot 솔랭 분석"
            description="플레이어별 Riot 솔랭 분석, 최근 전적, 챔피언/라인 통계는 방별 유료 기능입니다."
          />
        }
        renderLockedContent={false}
      >
        <div />
      </PremiumFeatureGate>
    );
  }

  const analysis = await getRiotPlayerAnalysis(id);

  if (!analysis) {
    notFound();
  }

  const riotId = analysis.riotAccount
    ? `${analysis.riotAccount.gameName}#${analysis.riotAccount.tagLine}`
    : analysis.player.riotId;
  const recentForm = analysis.recentMatches.slice(0, 20);
  const maxPositionGames = Math.max(
    ...analysis.positionStats.map((position) => position.games),
    1,
  );
  const maxRecentChampionGames = Math.max(
    ...analysis.recentChampions.map((champion) => champion.games),
    1,
  );
  const maxMostChampionGames = Math.max(
    ...analysis.mostChampions.map((champion) => champion.games),
    1,
  );
  const bestRecentChampion = analysis.recentChampions[0] ?? null;

  return (
    <div className={`page-shell player-riot-detail-page ${styles.riotDetailPage}`}>
      <div className="page-header player-hero">
        <div>
          <p className="page-eyebrow">Riot 솔랭 분석</p>
          <h1 className="page-title">
            {analysis.player.name} ({analysis.player.nickname}#{analysis.player.tag})
          </h1>
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

      <section className={`content-section player-panel ${styles.visualPanel}`}>
        <div className={styles.visualGrid}>
          <article className={styles.formCard}>
            <span className={styles.visualEyebrow}>RECENT FORM</span>
            <strong>최근 20게임 흐름</strong>
            <div className={styles.formTrack} aria-label="최근 20게임 승패 흐름">
              {recentForm.length === 0 ? (
                <span className={styles.formEmpty}>기록 없음</span>
              ) : (
                recentForm.map((match) => (
                  <span
                    key={match.id}
                    className={`${styles.formDot} ${match.win ? styles.formDotWin : styles.formDotLoss}`}
                    title={`${match.win ? "승리" : "패배"} · ${match.championNameKo}`}
                  />
                ))
              )}
            </div>
            <div className={styles.formSummary}>
              <span>{analysis.recentSummary.wins}승</span>
              <span>{analysis.recentSummary.losses}패</span>
              <span>승률 {analysis.recentSummary.winRate}%</span>
            </div>
          </article>

          <article className={styles.focusChampionCard}>
            <span className={styles.visualEyebrow}>BEST CHAMPION</span>
            {bestRecentChampion ? (
              <div className={styles.focusChampionMain}>
                <img
                  src={getChampionImageUrl(bestRecentChampion.championName)}
                  alt=""
                  className={styles.focusChampionImage}
                  loading="lazy"
                />
                <div>
                  <strong>{bestRecentChampion.championNameKo}</strong>
                  <span>
                    {bestRecentChampion.games}게임 · 승률 {bestRecentChampion.winRate}% · 평점 {bestRecentChampion.kda}
                  </span>
                </div>
              </div>
            ) : (
              <div className={styles.emptyState}>최근 챔피언 기록이 없습니다.</div>
            )}
          </article>

          <article className={styles.positionMiniChart}>
            <span className={styles.visualEyebrow}>POSITION SHARE</span>
            <strong>라인 점유율</strong>
            <div className={styles.positionMiniRows}>
              {analysis.positionStats.length === 0 ? (
                <span className={styles.formEmpty}>기록 없음</span>
              ) : (
                analysis.positionStats.slice(0, 5).map((position) => (
                  <div key={position.position} className={styles.miniBarRow}>
                    <span>{position.label}</span>
                    <div>
                      <i style={{ width: `${getShare(position.games, maxPositionGames)}%` }} />
                    </div>
                    <b>{position.games}</b>
                  </div>
                ))
              )}
            </div>
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
                  <div className={styles.rowBar} aria-hidden="true">
                    <span style={{ width: `${getShare(position.games, maxPositionGames)}%` }} />
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
                    <span className={styles.championTitle}>
                      <img
                        src={getChampionImageUrl(champion.championName)}
                        alt=""
                        className={styles.championAvatar}
                        loading="lazy"
                      />
                      <strong>{champion.championNameKo}</strong>
                    </span>
                    <span>{champion.games}게임 · {champion.wins}승 {champion.losses}패</span>
                  </div>
                  <div className={styles.rowNumber}>
                    <strong>{champion.winRate}%</strong>
                    <span>평점 {champion.kda}</span>
                  </div>
                  <div className={styles.rowBar} aria-hidden="true">
                    <span style={{ width: `${getShare(champion.games, maxRecentChampionGames)}%` }} />
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
                  <span className={styles.championTitle}>
                    <img
                      src={getChampionImageUrl(champion.championName)}
                      alt=""
                      className={styles.championAvatar}
                      loading="lazy"
                    />
                    <strong>{champion.championNameKo}</strong>
                  </span>
                  <span>{champion.games}게임 · {champion.wins}승 {champion.losses}패 · {champion.averageKills} / {champion.averageDeaths} / {champion.averageAssists}</span>
                </div>
                <div className={styles.rowNumber}>
                  <strong>{champion.winRate}%</strong>
                  <span>평점 {champion.kda}</span>
                </div>
                <div className={styles.rowBar} aria-hidden="true">
                  <span style={{ width: `${getShare(champion.games, maxMostChampionGames)}%` }} />
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
                  <img
                    src={getChampionImageUrl(match.championName)}
                    alt=""
                    className={styles.matchChampionImage}
                    loading="lazy"
                  />
                  <div>
                    <strong>{match.championNameKo}</strong>
                    <span>{formatRiotPosition(match.position)}</span>
                  </div>
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
