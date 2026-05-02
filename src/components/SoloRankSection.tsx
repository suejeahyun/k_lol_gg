"use client";

import Image from "next/image";
import { CSSProperties, useEffect, useMemo, useState } from "react";

type SoloRankSectionProps = {
  playerId: number;
};

type SoloSummaryResponse = {
  player: {
    id: number;
    name: string;
    nickname: string;
    tag: string;
    riotId: string;
    currentTier: string | null;
    peakTier: string | null;
  };
  riotAccount: {
    gameName: string;
    tagLine: string;
    profileIconId: number | null;
    summonerLevel: number | null;
    lastSyncedAt: string | null;
  } | null;
  soloRank: {
    queueType: string;
    tier: string | null;
    rank: string | null;
    leaguePoints: number;
    wins: number;
    losses: number;
    winRate: number;
    updatedAt: string;
  } | null;
  recentSummary: {
    totalGames: number;
    wins: number;
    losses: number;
    winRate: number;
    averageKda: number;
    mainPosition: {
      position: string | null;
      games: number;
    } | null;
  };
  mostChampions: Array<{
    championId: number;
    championName: string;
    championNameKo: string;
    games: number;
    wins: number;
    losses: number;
    winRate: number;
    kda: number;
    averageKills: number;
    averageDeaths: number;
    averageAssists: number;
  }>;
  recentMatches: Array<{
    id: number;
    matchId: string;
    championId: number;
    championName: string;
    championNameKo: string;
    position: string | null;
    role: string | null;
    kills: number;
    deaths: number;
    assists: number;
    kda: number;
    win: boolean;
    gameDuration: number;
    gameCreation: string;
    summonerSpells: Array<number | null>;
    runes: {
      primaryRuneId: number | null;
      subRuneId: number | null;
    };
    items: Array<number | null>;
    totalDamageDealtToChampions: number;
    totalDamageTaken: number;
    visionScore: number;
  }>;
};

type RecentMostChampion = {
  championId: number;
  championName: string;
  championNameKo: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  kda: number;
  averageKills: number;
  averageDeaths: number;
  averageAssists: number;
};

const DDRAGON_VERSION = "15.24.1";

const POSITION_LABELS: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MIDDLE: "미드",
  BOTTOM: "원딜",
  UTILITY: "서포터",
  UNKNOWN: "미정",
};

const POSITION_IMAGE_URLS: Record<string, string> = {
  TOP: "/images/positions/position-top.png",
  JUNGLE: "/images/positions/position-jungle.png",
  MIDDLE: "/images/positions/position-mid.png",
  BOTTOM: "/images/positions/position-adc.png",
  UTILITY: "/images/positions/position-sup.png",
};

const TIER_LABELS: Record<string, string> = {
  IRON: "아이언",
  BRONZE: "브론즈",
  SILVER: "실버",
  GOLD: "골드",
  PLATINUM: "플래티넘",
  EMERALD: "에메랄드",
  DIAMOND: "다이아몬드",
  MASTER: "마스터",
  GRANDMASTER: "그랜드마스터",
  CHALLENGER: "챌린저",
};

function getChampionImageUrl(championName: string) {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${championName}.png`;
}

function getItemImageUrl(itemId: number) {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/${itemId}.png`;
}

function formatPosition(position: string | null) {
  if (!position) {
    return "미정";
  }

  return POSITION_LABELS[position] ?? position;
}
function getPositionImageUrl(position: string | null) {
  if (!position) {
    return null;
  }

  return POSITION_IMAGE_URLS[position] ?? null;
}
function formatTier(tier: string | null, rank: string | null, lp: number) {
  if (!tier) {
    return "Unranked";
  }

  const tierLabel = TIER_LABELS[tier] ?? tier;

  if (tier === "MASTER" || tier === "GRANDMASTER" || tier === "CHALLENGER") {
    return `${tierLabel} ${lp}LP`;
  }

  return `${tierLabel} ${rank ?? ""} ${lp}LP`;
}

function formatGameDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;

  return `${minutes}분 ${remainSeconds.toString().padStart(2, "0")}초`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function getKdaTone(kda: number) {
  if (kda >= 5) {
    return "excellent";
  }

  if (kda >= 3) {
    return "good";
  }

  return "normal";
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function toFixedNumber(value: number, digit = 2) {
  if (!Number.isFinite(value)) {
    return Number((0).toFixed(digit));
  }

  return Number(value.toFixed(digit));
}

function getRecentMostChampions(
  recentMatches: SoloSummaryResponse["recentMatches"]
): RecentMostChampion[] {
  const championMap = new Map<
    number,
    {
      championId: number;
      championName: string;
      championNameKo: string;
      games: number;
      wins: number;
      losses: number;
      kills: number;
      deaths: number;
      assists: number;
    }
  >();

  recentMatches.forEach((match) => {
    const existing = championMap.get(match.championId);

    if (!existing) {
      championMap.set(match.championId, {
        championId: match.championId,
        championName: match.championName,
        championNameKo: match.championNameKo,
        games: 1,
        wins: match.win ? 1 : 0,
        losses: match.win ? 0 : 1,
        kills: match.kills,
        deaths: match.deaths,
        assists: match.assists,
      });

      return;
    }

    existing.games += 1;
    existing.wins += match.win ? 1 : 0;
    existing.losses += match.win ? 0 : 1;
    existing.kills += match.kills;
    existing.deaths += match.deaths;
    existing.assists += match.assists;
  });

  return Array.from(championMap.values())
    .map((champion) => {
      const winRate =
        champion.games > 0 ? (champion.wins / champion.games) * 100 : 0;

      const kda =
        champion.deaths === 0
          ? champion.kills + champion.assists
          : (champion.kills + champion.assists) / champion.deaths;

      return {
        championId: champion.championId,
        championName: champion.championName,
        championNameKo: champion.championNameKo,
        games: champion.games,
        wins: champion.wins,
        losses: champion.losses,
        winRate: toFixedNumber(winRate, 1),
        kda: toFixedNumber(kda, 2),
        averageKills: toFixedNumber(champion.kills / champion.games, 1),
        averageDeaths: toFixedNumber(champion.deaths / champion.games, 1),
        averageAssists: toFixedNumber(champion.assists / champion.games, 1),
      };
    })
    .sort((a, b) => {
      if (b.games !== a.games) {
        return b.games - a.games;
      }

      if (b.winRate !== a.winRate) {
        return b.winRate - a.winRate;
      }

      return b.kda - a.kda;
    })
    .slice(0, 3);
}

export default function SoloRankSection({ playerId }: SoloRankSectionProps) {
  const [data, setData] = useState<SoloSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [fullSyncing, setFullSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const summaryUrl = useMemo(
    () => `/api/riot/player/${playerId}/summary`,
    [playerId]
  );

  const recentMostChampions = useMemo(() => {
    if (!data) {
      return [];
    }

    return getRecentMostChampions(data.recentMatches);
  }, [data]);

  const recentAverageDamage = useMemo(() => {
    if (!data || data.recentMatches.length === 0) {
      return 0;
    }

    const total = data.recentMatches.reduce(
      (sum, match) => sum + match.totalDamageDealtToChampions,
      0
    );

    return Math.round(total / data.recentMatches.length);
  }, [data]);

  const recentAverageVision = useMemo(() => {
    if (!data || data.recentMatches.length === 0) {
      return 0;
    }

    const total = data.recentMatches.reduce(
      (sum, match) => sum + match.visionScore,
      0
    );

  return Number((total / data.recentMatches.length).toFixed(1));
}, [data]);

  const mainPosition = data?.recentSummary.mainPosition?.position ?? null;
  const mainPositionImageUrl = getPositionImageUrl(mainPosition);
  async function fetchSummary() {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch(summaryUrl, {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.message || "솔랭 분석 데이터를 불러오지 못했습니다.");
        return;
      }

      setData(result);
    } catch {
      setMessage("솔랭 분석 데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    try {
      setSyncing(true);
      setMessage("");

      const response = await fetch(`/api/riot/player/${playerId}/sync`, {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 429 && result.remainSeconds) {
          const minutes = Math.ceil(result.remainSeconds / 60);
          setMessage(`전적 갱신은 약 ${minutes}분 후 다시 가능합니다.`);
          return;
        }

        setMessage(result.message || "솔랭 전적 갱신에 실패했습니다.");
        return;
      }

      setMessage("솔랭 전적 갱신이 완료되었습니다.");
      await fetchSummary();
    } catch {
      setMessage("솔랭 전적 갱신 중 오류가 발생했습니다.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleFullSync() {
    const confirmed = window.confirm(
      "전체 솔랭 최초 갱신은 Riot API에서 조회 가능한 솔랭 기록을 모두 저장합니다.\n경기 수가 많으면 시간이 오래 걸리고 API 제한이 발생할 수 있습니다. 진행하시겠습니까?"
    );

    if (!confirmed) {
      return;
    }

    try {
      setFullSyncing(true);
      setMessage("");

      const response = await fetch(`/api/riot/player/${playerId}/sync-full`, {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 429 && result.remainSeconds) {
          const hours = Math.ceil(result.remainSeconds / 3600);
          setMessage(`전체 갱신은 약 ${hours}시간 후 다시 가능합니다.`);
          return;
        }

        setMessage(result.message || "전체 솔랭 기록 갱신에 실패했습니다.");
        return;
      }

      const synced = result.synced;

      setMessage(
        `전체 솔랭 기록 갱신 완료: 요청 ${synced.requestedMatchCount}게임 / 저장 ${synced.savedMatchCount}게임 / 실패 ${synced.failedMatchCount}게임`
      );

      await fetchSummary();
    } catch {
      setMessage("전체 솔랭 기록 갱신 중 오류가 발생했습니다.");
    } finally {
      setFullSyncing(false);
    }
  }

  useEffect(() => {
    void fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryUrl]);

  if (loading) {
    return (
      <section className="content-section player-panel solo-section">
        <div className="section-header">
          <h2>솔랭 분석</h2>
        </div>
        <div className="empty-box">솔랭 데이터를 불러오는 중입니다.</div>
      </section>
    );
  }

  return (
    <section className="solo-section">
      <div className="content-section player-panel solo-overview-panel">
        <div className="section-header section-header--split">
          <div>
            <h2>솔랭 분석</h2>
            <p className="section-subtitle">
              일반 갱신은 최근 20게임, 전체 최초 갱신은 조회 가능한 솔랭 기록 전체를 저장합니다.
            </p>
          </div>

          <div className="solo-sync-actions">
            <button
              type="button"
              className="btn btn-primary solo-sync-button"
              onClick={handleSync}
              disabled={syncing || fullSyncing}
            >
              {syncing ? "갱신 중..." : "솔랭 전적 갱신"}
            </button>

            <button
              type="button"
              className="btn btn-ghost solo-sync-button"
              onClick={handleFullSync}
              disabled={syncing || fullSyncing}
            >
              {fullSyncing ? "전체 갱신 중..." : "전체 솔랭 기록 갱신"}
            </button>
          </div>
        </div>

        {message ? <div className="solo-message">{message}</div> : null}

        {!data ? (
          <div className="empty-box">솔랭 분석 데이터가 없습니다.</div>
        ) : (
          <>
            <div className="solo-rank-overview">
              <article className="solo-rank-card solo-rank-card--wide">
                <div className="solo-rank-main">
                  <span className="solo-card-label">솔로랭크</span>

                  <strong className="solo-rank-tier">
                    {data.soloRank
                      ? formatTier(
                          data.soloRank.tier,
                          data.soloRank.rank,
                          data.soloRank.leaguePoints
                        )
                      : "Unranked"}
                  </strong>

                  <p>
                    {data.soloRank
                      ? `${data.soloRank.wins}승 ${data.soloRank.losses}패 · 승률 ${data.soloRank.winRate}%`
                      : "랭크 정보 없음"}
                  </p>

                  <span className="solo-rank-id">
                    {data.riotAccount
                      ? `${data.riotAccount.gameName}#${data.riotAccount.tagLine}`
                      : data.player.riotId}
                  </span>
                </div>

                <div className="solo-rank-divider" />

                <div className="solo-winrate-donut-wrap">
                  <div
                    className="solo-winrate-donut"
                    style={
                      {
                        "--solo-win-rate": `${clampPercent(
                          data.recentSummary.winRate
                        )}%`,
                      } as CSSProperties
                    }
                  >
                    <div className="solo-winrate-donut__inner">
                      <strong>{data.recentSummary.winRate}%</strong>
                      <span>최근 승률</span>
                    </div>
                  </div>

                  <p className="solo-winrate-record">
                    {data.recentSummary.totalGames}전 {data.recentSummary.wins}승{" "}
                    {data.recentSummary.losses}패
                  </p>
                </div>

                <div className="solo-rank-stat-grid">
                  <div className="solo-rank-summary-stat">
                    <span>승리</span>
                    <strong className="solo-text-blue">
                      {data.recentSummary.wins}
                    </strong>
                  </div>

                  <div className="solo-rank-summary-stat">
                    <span>패배</span>
                    <strong className="solo-text-red">
                      {data.recentSummary.losses}
                    </strong>
                  </div>

                  <div className="solo-rank-summary-stat">
                    <span>최고 티어</span>
                    <strong className="solo-rank-summary-stat__text">
                      {data.player.peakTier ?? "기록 없음"}
                    </strong>
                  </div>

                  <div className="solo-rank-summary-stat">
                    <span>평균 KDA</span>
                    <strong>{data.recentSummary.averageKda}</strong>
                  </div>

                  <div className="solo-rank-summary-stat">
                    <span>평균 딜량</span>
                    <strong>{recentAverageDamage.toLocaleString()}</strong>
                  </div>

                  <div className="solo-rank-summary-stat">
                    <span>평균 시야</span>
                    <strong>{recentAverageVision}</strong>
                  </div>
                </div>
              </article>
            </div>

            <div className="solo-analysis-bottom">
              <article className="solo-role-card">
                <h3>주 포지션</h3>

                <div className="solo-role-image">
                  {mainPositionImageUrl ? (
                    <Image
                      src={mainPositionImageUrl}
                      alt={`${formatPosition(mainPosition)} 포지션`}
                      width={128}
                      height={128}
                      className="solo-role-position-image"
                      priority={false}
                    />
                  ) : (
                    <span>POSITION</span>
                  )}
                </div>

                <strong className="solo-role-name">
                  {formatPosition(data.recentSummary.mainPosition?.position ?? null)}
                </strong>

                <p>
                  {data.recentSummary.totalGames}게임 중{" "}
                  {data.recentSummary.mainPosition?.games ?? 0}게임
                </p>

                <div className="solo-role-rate">
                  <strong>
                    {data.recentSummary.totalGames > 0
                      ? Math.round(
                          ((data.recentSummary.mainPosition?.games ?? 0) /
                            data.recentSummary.totalGames) *
                            100
                        )
                      : 0}
                    %
                  </strong>
                  <span>플레이 비중</span>
                </div>
              </article>

              <article className="solo-most-section solo-most-section--panel">
                <div className="section-header section-header--split">
                  <div>
                    <h3>최근 20게임 모스트 TOP 3</h3>
                    <p className="section-subtitle">
                      최근 전적에 저장된 최대 20게임 기준입니다.
                    </p>
                  </div>
                </div>

                {recentMostChampions.length === 0 ? (
                  <div className="empty-box">
                    최근 20게임 챔피언 기록이 없습니다.
                  </div>
                ) : (
                  <div className="solo-most-grid solo-most-grid--top3">
                    {recentMostChampions.map((champion, index) => (
                      <article
                        key={champion.championId}
                        className="solo-most-card solo-most-card--featured"
                      >
                        <span
                          className={`solo-most-rank solo-most-rank--${
                            index + 1
                          }`}
                        >
                          {index + 1}
                        </span>

                        <Image
                          src={getChampionImageUrl(champion.championName)}
                          alt={champion.championNameKo}
                          width={112}
                          height={112}
                          className="solo-most-image solo-most-image--featured"
                        />

                        <div className="solo-most-info">
                          <strong>{champion.championNameKo}</strong>
                          <span>
                            {champion.games}게임 · {champion.wins}승{" "}
                            {champion.losses}패
                          </span>
                        </div>

                        <div className="solo-most-numbers">
                          <strong>{champion.winRate}%</strong>
                          <span>승률</span>
                        </div>

                        <div className="solo-most-kda">
                          <strong>{champion.kda}</strong>
                          <span>KDA</span>
                        </div>

                        <p className="solo-most-average">
                          {champion.averageKills.toFixed(1)} /{" "}
                          {champion.averageDeaths.toFixed(1)} /{" "}
                          {champion.averageAssists.toFixed(1)}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </article>
            </div>

            <div className="solo-most-section solo-most-section--top10">
              <div className="section-header section-header--split">
                <div>
                  <h3>모스트 챔피언 TOP 10</h3>
                  <p className="section-subtitle">
                    전체 저장된 솔랭 기록 기준입니다.
                  </p>
                </div>
              </div>

              {data.mostChampions.length === 0 ? (
                <div className="empty-box">
                  저장된 솔랭 챔피언 기록이 없습니다.
                </div>
              ) : (
                <div className="solo-most-grid solo-most-grid--top10">
                  {data.mostChampions.slice(0, 10).map((champion, index) => (
                    <article
                      key={champion.championId}
                      className="solo-most-card"
                    >
                      <span className="solo-most-rank">{index + 1}</span>

                      <Image
                        src={getChampionImageUrl(champion.championName)}
                        alt={champion.championNameKo}
                        width={46}
                        height={46}
                        className="solo-most-image"
                      />

                      <div className="solo-most-info">
                        <strong>{champion.championNameKo}</strong>
                        <span>
                          {champion.games}게임 · {champion.wins}승{" "}
                          {champion.losses}패
                        </span>
                      </div>

                      <div className="solo-most-numbers">
                        <strong>{champion.winRate}%</strong>
                        <span>KDA {champion.kda}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="content-section player-panel solo-history-panel">
        <div className="section-header section-header--split">
          <div>
            <h2>솔랭 최근 전적</h2>
            <p className="section-subtitle">
              최근 솔로랭크 최대 20게임을 OP.GG 카드형으로 표시합니다.
            </p>
          </div>
        </div>

        {!data || data.recentMatches.length === 0 ? (
          <div className="empty-box">
            최근 솔랭 기록이 없습니다. 전적 갱신 버튼을 눌러 데이터를 저장하세요.
          </div>
        ) : (
          <div className="solo-match-list">
            {data.recentMatches.map((match) => {
              const kdaTone = getKdaTone(match.kda);

              return (
                <article
                  key={match.id}
                  className={`solo-match-card ${
                    match.win ? "solo-match-card--win" : "solo-match-card--loss"
                  }`}
                >
                  <div className="solo-match-result">
                    <strong>{match.win ? "승리" : "패배"}</strong>
                    <span>{formatDate(match.gameCreation)}</span>
                    <small>{formatGameDuration(match.gameDuration)}</small>
                  </div>

                  <div className="solo-match-champion">
                    <Image
                      src={getChampionImageUrl(match.championName)}
                      alt={match.championNameKo}
                      width={54}
                      height={54}
                      className="solo-match-champion-image"
                    />
                    <div>
                      <strong>{match.championNameKo}</strong>
                      <span>{formatPosition(match.position)}</span>
                    </div>
                  </div>

                  <div className="solo-match-kda">
                    <strong>
                      {match.kills} / {match.deaths} / {match.assists}
                    </strong>
                    <span className={`solo-kda-tone solo-kda-tone--${kdaTone}`}>
                      평점 {match.kda}
                    </span>
                  </div>

                  <div className="solo-match-extra">
                    <span>
                      딜량 {match.totalDamageDealtToChampions.toLocaleString()}
                    </span>
                    <span>
                      받은 피해 {match.totalDamageTaken.toLocaleString()}
                    </span>
                    <span>시야 {match.visionScore}</span>
                  </div>

                  <div className="solo-match-items">
                    {match.items.slice(0, 6).map((itemId, itemIndex) =>
                      itemId && itemId > 0 ? (
                        <Image
                          key={`${match.id}-${itemIndex}`}
                          src={getItemImageUrl(itemId)}
                          alt={`item-${itemId}`}
                          width={28}
                          height={28}
                          className="solo-item-image"
                        />
                      ) : (
                        <span
                          key={`${match.id}-${itemIndex}`}
                          className="solo-item-empty"
                        />
                      )
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}