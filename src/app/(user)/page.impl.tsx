export const dynamic = "force-dynamic";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma/client";
import GalleryWinnerSlider from "@/components/GalleryWinnerSlider";
import HomeTop3Tabs from "@/components/HomeTop3Tabs";
import RecentMvpSlider from "@/components/RecentMvpSlider";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getCachedHomePlayerTiers,
  getCachedHomePublicData,
  getCachedHomeSeasonSummary,
} from "@/lib/home/public-data";
import { calculateMvpScore, getGameMvpParticipant } from "@/lib/mvp";
import { getCachedStatsTopData } from "@/lib/stats/top";

function getDestructionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PLANNED: "기획중",
    RECRUITING: "모집중",
    TEAM_BUILDING: "팀 구성중",
    AUCTION: "경매 진행",
    PRELIMINARY: "예선 진행",
    TOURNAMENT: "토너먼트 진행",
    COMPLETED: "종료",
    CANCELLED: "취소",
  };

  return labels[status] ?? status;
}

function getDestructionProgressPercent(status?: string | null) {
  if (!status) return "10%";

  const values: Record<string, string> = {
    PLANNED: "10%",
    RECRUITING: "25%",
    TEAM_BUILDING: "40%",
    AUCTION: "50%",
    PRELIMINARY: "60%",
    TOURNAMENT: "80%",
    COMPLETED: "100%",
    CANCELLED: "0%",
  };

  return values[status] ?? "10%";
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
  });
}

function getTierImageSrc(tier?: string | null) {
  const normalized = (tier ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z가-힣]/g, "");

  if (normalized.includes("challenger") || normalized.includes("챌린저")) {
    return "/images/tiers/challenger.webp";
  }
  if (normalized.includes("grandmaster") || normalized.includes("그랜드마스터")) {
    return "/images/tiers/grandmaster.webp";
  }
  if (normalized.includes("master") || normalized.includes("마스터")) {
    return "/images/tiers/master.webp";
  }
  if (normalized.includes("diamond") || normalized.includes("다이아")) {
    return "/images/tiers/diamond.webp";
  }
  if (normalized.includes("emerald") || normalized.includes("에메랄드")) {
    return "/images/tiers/emerald.webp";
  }
  if (normalized.includes("platinum") || normalized.includes("플래티넘")) {
    return "/images/tiers/platinum.webp";
  }
  if (normalized.includes("gold") || normalized.includes("골드")) {
    return "/images/tiers/gold.webp";
  }
  if (normalized.includes("silver") || normalized.includes("실버")) {
    return "/images/tiers/silver.webp";
  }
  if (normalized.includes("bronze") || normalized.includes("브론즈")) {
    return "/images/tiers/bronze.webp";
  }
  if (normalized.includes("iron") || normalized.includes("아이언")) {
    return "/images/tiers/iron.webp";
  }

  return "/images/tiers/silver.webp";
}

export default async function HomePage() {
  const [topData, publicData, currentUser] = await Promise.all([
    getCachedStatsTopData(),
    getCachedHomePublicData(),
    getCurrentUser(),
  ]);

  const {
    winnerImages,
    recentMatches,
    latestDestruction,
    latestMvpSeries,
    latestMvpMatches,
    siteSettings,
  } = publicData;

  const currentSeasonId = topData.currentSeason?.id ?? null;

  type HomeTop3Player = (typeof topData.currentPlayers)[number];
  type HomeTop3ModeId = "winrate" | "mvp" | "participation";

  const eligibleSeasonPlayers = [...topData.currentPlayers].filter(
    (player) => player.participation >= 10,
  );

  const top3Modes: {
    id: HomeTop3ModeId;
    label: string;
    eyebrow: string;
    title: string;
    aceLabel: string;
    metricLabel: string;
    value: (player: HomeTop3Player) => number;
    displayValue: (player: HomeTop3Player) => string;
    rankLine: (player: HomeTop3Player) => string;
    secondStat: (player: HomeTop3Player) => { label: string; value: string };
    thirdStat: (player: HomeTop3Player) => { label: string; value: string };
    players: HomeTop3Player[];
  }[] = [
    {
      id: "winrate",
      label: "승률",
      eyebrow: "WIN RATE",
      title: "승률 TOP 3",
      aceLabel: "WIN RATE ACE",
      metricLabel: "승률",
      value: (player) => player.winRate,
      displayValue: (player) => `${player.winRate}%`,
      rankLine: (player) =>
        `승률 ${player.winRate}% · 내전 ${player.participation}회 · 세트 ${player.wins}승 ${player.losses}패`,
      secondStat: (player) => ({ label: "내전", value: `${player.participation}` }),
      thirdStat: (player) => ({ label: "MVP", value: `${player.mvpCount}` }),
      players: [...eligibleSeasonPlayers]
        .sort((a, b) => {
          if (b.winRate !== a.winRate) return b.winRate - a.winRate;
          if (b.mvpCount !== a.mvpCount) return b.mvpCount - a.mvpCount;
          return b.participation - a.participation;
        })
        .slice(0, 3),
    },
    {
      id: "mvp",
      label: "MVP",
      eyebrow: "MVP",
      title: "MVP TOP 3",
      aceLabel: "MVP ACE",
      metricLabel: "MVP",
      value: (player) => player.mvpCount,
      displayValue: (player) => `${player.mvpCount}`,
      rankLine: (player) =>
        `MVP ${player.mvpCount}회 · 내전 ${player.participation}회 · 승률 ${player.winRate}%`,
      secondStat: (player) => ({ label: "내전", value: `${player.participation}` }),
      thirdStat: (player) => ({ label: "승률", value: `${player.winRate}%` }),
      players: [...eligibleSeasonPlayers]
        .filter((player) => player.mvpCount > 0)
        .sort((a, b) => {
          if (b.mvpCount !== a.mvpCount) return b.mvpCount - a.mvpCount;
          if (b.winRate !== a.winRate) return b.winRate - a.winRate;
          return b.participation - a.participation;
        })
        .slice(0, 3),
    },
    {
      id: "participation",
      label: "최다참여",
      eyebrow: "PARTICIPATION",
      title: "최다참여 TOP 3",
      aceLabel: "IRON PLAYER",
      metricLabel: "참여",
      value: (player) => player.participation,
      displayValue: (player) => `${player.participation}`,
      rankLine: (player) =>
        `내전 ${player.participation}회 · 세트 ${player.wins}승 ${player.losses}패 · MVP ${player.mvpCount}회`,
      secondStat: (player) => ({ label: "승률", value: `${player.winRate}%` }),
      thirdStat: (player) => ({ label: "MVP", value: `${player.mvpCount}` }),
      players: [...eligibleSeasonPlayers]
        .sort((a, b) => {
          if (b.participation !== a.participation) return b.participation - a.participation;
          if (b.winRate !== a.winRate) return b.winRate - a.winRate;
          return b.mvpCount - a.mvpCount;
        })
        .slice(0, 3),
    },
  ];

  const top3PlayerIds = Array.from(
    new Set(
      top3Modes.flatMap((mode) =>
        mode.players.map((player) => player.playerId),
      ),
    ),
  );

  const [topPlayerTiers, seasonSummary, mySeasonParticipants, mySeasonMvpCount] =
    await Promise.all([
      getCachedHomePlayerTiers(top3PlayerIds),
      currentSeasonId
        ? getCachedHomeSeasonSummary(currentSeasonId)
        : Promise.resolve({ matchCount: 0, gameCount: 0, participantCount: 0 }),
      currentSeasonId && currentUser?.playerId
        ? prisma.matchParticipant.findMany({
            where: {
              playerId: currentUser.playerId,
              game: { series: { seasonId: currentSeasonId } },
            },
            select: {
              kills: true,
              deaths: true,
              assists: true,
              game: { select: { seriesId: true } },
            },
          })
        : Promise.resolve([]),
      currentSeasonId && currentUser?.playerId
        ? prisma.matchGame.count({
            where: {
              mvpPlayerId: currentUser.playerId,
              series: { seasonId: currentSeasonId },
            },
          })
        : Promise.resolve(0),
    ]);

  const topPlayerTierMap = new Map(
    topPlayerTiers.map((player) => [
      player.id,
      player.currentTier ?? player.peakTier ?? null,
    ]),
  );

  const homeTop3Modes = top3Modes.map((mode) => {
    const leaderScore = Math.max(1, mode.players[0] ? mode.value(mode.players[0]) : 1);
    const cards = mode.players.map((player, index) => {
      const rank = index + 1;
      const tierName = topPlayerTierMap.get(player.playerId) ?? "Unranked";
      const score = mode.value(player);

      return {
        player,
        rank,
        tierName,
        tierImageSrc: getTierImageSrc(tierName),
        tone: rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze",
        relativeScore: Math.max(8, Math.min(100, (score / leaderScore) * 100)),
        winRateMeter: Math.max(0, Math.min(100, player.winRate)),
        displayValue: mode.displayValue(player),
        rankLine: mode.rankLine(player),
        secondStat: mode.secondStat(player),
        thirdStat: mode.thirdStat(player),
      };
    });

    return {
      ...mode,
      cards,
      ace: cards[0] ?? null,
      chasers: cards.slice(1),
    };
  });

  const hasHomeTop3Data = homeTop3Modes.some((mode) => mode.cards.length > 0);

  const recentMvpSlides = latestMvpMatches.flatMap((match) =>
    match.games.flatMap((game) => {
      const storedMvpPlayerId = game.mvpPlayerId ?? null;
      const gameMvp = storedMvpPlayerId
        ? { playerId: storedMvpPlayerId }
        : getGameMvpParticipant(
            game.participants.map((participant) => ({
              playerId: participant.player.id,
              kills: participant.kills,
              deaths: participant.deaths,
              assists: participant.assists,
              team: participant.team,
            })),
            game.winnerTeam,
          );

      return game.participants
        .filter((participant) => participant.player.id === gameMvp?.playerId)
        .map((participant) => ({
          key: `${match.id}-${game.id}-${participant.player.id}`,
          matchId: match.id,
          matchTitle: match.title,
          matchDate: match.matchDate,
          gameNumber: game.gameNumber,
          playerId: participant.player.id,
          name: participant.player.name,
          nickname: participant.player.nickname,
          tag: participant.player.tag,
          championName: participant.champion.name,
          championImageUrl: participant.champion.imageUrl,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
          mvpScore:
            game.mvpScore ??
            calculateMvpScore({
              playerId: participant.player.id,
              kills: participant.kills,
              deaths: participant.deaths,
              assists: participant.assists,
              team: participant.team,
            }),
          isWin: participant.team === game.winnerTeam,
        }));
    }),
  );

  const recentMvpDateLabel = latestMvpSeries
    ? formatDate(latestMvpSeries.matchDate)
    : null;

  const mySeasonSeriesCount = new Set(
    mySeasonParticipants.map((participant) => participant.game.seriesId),
  ).size;
  const mySeasonKills = mySeasonParticipants.reduce(
    (sum, participant) => sum + participant.kills,
    0,
  );
  const mySeasonDeaths = mySeasonParticipants.reduce(
    (sum, participant) => sum + participant.deaths,
    0,
  );
  const mySeasonAssists = mySeasonParticipants.reduce(
    (sum, participant) => sum + participant.assists,
    0,
  );
  const mySeasonKda =
    mySeasonParticipants.length > 0
      ? ((mySeasonKills + mySeasonAssists) / Math.max(1, mySeasonDeaths)).toFixed(2)
      : "-";

  const visibleSeasonSummaryStats = currentUser?.playerId
    ? [
        { label: "현재 시즌", value: topData.currentSeason?.name ?? "시즌 없음" },
        { label: "내전 참가", value: mySeasonSeriesCount },
        { label: "평균 KDA", value: mySeasonKda },
        { label: "MVP", value: mySeasonMvpCount },
      ]
    : [
        { label: "현재 시즌", value: topData.currentSeason?.name ?? "시즌 없음" },
        { label: "내전 수", value: seasonSummary.matchCount },
        { label: "세트 수", value: seasonSummary.gameCount },
        { label: "참여 인원", value: seasonSummary.participantCount },
      ];

  return (
    <main className="page-container home-page home-dark-modern-page">
      <section className="home-dark-showcase" aria-label="K-LOL.GG 메인">
        <div className="home-dark-showcase-hero">
          <div className="home-dark-hero-copy">
            <p className="home-eyebrow">{siteSettings.homeEyebrow}</p>
            <h1 className="home-dark-hero-title">
              {siteSettings.homeHeroTitle} <span>{siteSettings.homeHeroAccent}</span>
            </h1>
            <p className="home-main-description">
              {siteSettings.homeHeroDescription}
            </p>

            <div className="home-dark-actions">
              <Link href={siteSettings.homePrimaryCtaHref} className="home-dark-primary-action">
                {siteSettings.homePrimaryCtaLabel}
              </Link>
              <Link href={siteSettings.homeSecondaryCtaHref} className="home-dark-secondary-action">
                {siteSettings.homeSecondaryCtaLabel}
              </Link>
            </div>
          </div>
        </div>

        <div className="home-dark-showcase-grid">
          <div className="home-dark-top3-panel">
            <div className="home-dark-panel-head">
              <div>
                <p className="home-eyebrow">SEASON RANKING</p>
                <h2 className="home-section-title">시즌 TOP 3 플레이어</h2>
              </div>
              <Link href="/rankings" className="home-dark-mini-link">
                랭킹 보기
              </Link>
            </div>

            {!hasHomeTop3Data ? (
              <div className="empty-box">
                내전 참여 10회 이상 기준에 맞는 랭킹 데이터가 없습니다.
              </div>
            ) : (
              <HomeTop3Tabs
                tabs={homeTop3Modes.map(({ id, eyebrow, label }) => ({ id, eyebrow, label }))}
              >
                  {homeTop3Modes.map((mode) => (
                    <div key={mode.id}>
                      {mode.ace ? (
                        <div className="home-top3-arena home-top3-arena--dynamic">
                          <span className="home-top3-arena__beam home-top3-arena__beam--left" aria-hidden="true" />
                          <span className="home-top3-arena__beam home-top3-arena__beam--right" aria-hidden="true" />
                          <Link
                            href={`/players/${mode.ace.player.playerId}`}
                            className="home-top3-ace"
                            style={{
                              "--top3-score": `${mode.ace.relativeScore}%`,
                              "--top3-fill": `${mode.ace.winRateMeter}%`,
                              "--top3-winrate": `${mode.ace.winRateMeter}%`,
                            } as CSSProperties}
                          >
                            <span className="home-top3-ace__ordinal" aria-hidden="true">
                              01
                            </span>
                            <span className="home-top3-ace__orbit" aria-hidden="true" />
                            <span className="home-top3-ace__glow" aria-hidden="true" />
                            <span className="home-top3-ace__visual">
                              <Image
                                src={mode.ace.tierImageSrc}
                                alt={mode.ace.tierName}
                                width={116}
                                height={116}
                              />
                              <span className="home-top3-medal home-top3-medal--gold" aria-hidden="true">
                                {mode.ace.rank}
                              </span>
                            </span>

                            <span className="home-top3-ace__meta">{mode.aceLabel}</span>
                            <span className="home-top3-ace__rankline">
                              {mode.ace.rankLine}
                            </span>
                            <strong className="home-top3-ace__name">
                              {mode.ace.player.name}
                            </strong>
                            <small className="home-top3-ace__nickname">
                              {mode.ace.player.nickname}#{mode.ace.player.tag}
                            </small>

                            <div className="home-top3-scoreline">
                              <span>
                                <b>{mode.ace.displayValue}</b>
                                <small>{mode.metricLabel}</small>
                              </span>
                              <span>
                                <b>{mode.ace.secondStat.value}</b>
                                <small>{mode.ace.secondStat.label}</small>
                              </span>
                              <span>
                                <b>{mode.ace.thirdStat.value}</b>
                                <small>{mode.ace.thirdStat.label}</small>
                              </span>
                            </div>
                            <span className="home-top3-meter" aria-hidden="true">
                              <span />
                            </span>
                          </Link>

                          <div
                            className="home-top3-chasers"
                            role="group"
                            aria-label={`${mode.title} 추격자`}
                          >
                            {mode.chasers.map((slot) => (
                              <Link
                                key={`${mode.id}-${slot.rank}`}
                                href={`/players/${slot.player.playerId}`}
                                className={`home-top3-chaser home-top3-chaser--${slot.tone}`}
                                style={{
                                  "--top3-score": `${slot.relativeScore}%`,
                                  "--top3-fill": `${slot.winRateMeter}%`,
                                  "--top3-winrate": `${slot.winRateMeter}%`,
                                } as CSSProperties}
                              >
                                <span className="home-top3-chaser__rank" aria-hidden="true">
                                  {slot.rank}
                                </span>
                                <span className="home-top3-chaser__tier">
                                  <Image
                                    src={slot.tierImageSrc}
                                    alt={slot.tierName}
                                    width={54}
                                    height={54}
                                  />
                                </span>
                                <span className="home-top3-chaser__body">
                                  <strong>{slot.player.name}</strong>
                                  <small>{slot.player.nickname}#{slot.player.tag}</small>
                                </span>
                                <span className="home-top3-chaser__stats">
                                  <b>{slot.displayValue}</b>
                                  <small>
                                    {slot.secondStat.label} {slot.secondStat.value} · {slot.thirdStat.label} {slot.thirdStat.value}
                                  </small>
                                </span>
                                <span className="home-top3-meter home-top3-meter--mini" aria-hidden="true">
                                  <span />
                                </span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="empty-box">
                          {mode.title} 기준에 맞는 랭킹 데이터가 없습니다.
                        </div>
                      )}
                    </div>
                  ))}
              </HomeTop3Tabs>
            )}
          </div>

          <section
            className="home-dark-recent-panel home-dark-recent-panel--standalone"
            aria-labelledby="recent-matches-title"
          >
            <div className="home-dark-panel-head">
              <div>
                <p className="home-eyebrow">RECENT MATCHES</p>
                <h2 className="home-section-title" id="recent-matches-title">최근 내전</h2>
              </div>
              <Link href="/matches" className="home-dark-mini-link">
                전체 보기
              </Link>
            </div>

            <div className="home-dark-recent-list">
              {recentMatches.length === 0 ? (
                <div className="empty-box">등록된 내전이 없습니다.</div>
              ) : (
                recentMatches.slice(0, 5).map((match) => {
                  const blueWins = match.games.filter(
                    (game) => game.winnerTeam === "BLUE",
                  ).length;
                  const redWins = match.games.filter(
                    (game) => game.winnerTeam === "RED",
                  ).length;
                  const resultLabel =
                    blueWins > redWins
                      ? "BLUE 승"
                      : redWins > blueWins
                        ? "RED 승"
                        : "무승부";

                  return (
                    <Link
                      key={match.id}
                      href={`/matches/${match.id}`}
                      className="home-dark-recent-row"
                    >
                      <span>{formatDate(match.matchDate)}</span>
                      <strong>{match.title}</strong>
                      <em data-result={resultLabel}>{resultLabel}</em>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          <div className="home-season-card home-dark-season-summary">
            <div className="home-section-head">
              <div>
                <p className="home-eyebrow">CURRENT SEASON</p>
                <h2 className="home-section-title">
                  {currentUser?.playerId ? "내 시즌 요약" : "시즌 요약"}
                </h2>
              </div>
            </div>

            <div className="home-season-grid">
              {visibleSeasonSummaryStats.map((stat) => (
                <div key={stat.label} className="home-stat-box">
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="home-feature-stack">
        <div className="home-feature-stack__winner">
          <GalleryWinnerSlider images={winnerImages} />
        </div>

        <div className="home-feature-bottom-grid">
          <RecentMvpSlider
            items={recentMvpSlides}
            dateLabel={recentMvpDateLabel}
          />
          <div className="card home-progress-card">
            <div className="home-section-head">
              <div>
                <p className="home-eyebrow">PROGRESS</p>
                <h2 className="home-section-title">진행현황</h2>
              </div>
              <Link href="/progress" className="chip-button">
                전체 보기
              </Link>
            </div>
            <div className="home-progress-list">
              <Link href="/progress/destruction" className="home-progress-item">
                <div className="home-progress-item__top">
                  <strong>멸망전</strong>
                  <span>
                    {latestDestruction
                      ? getDestructionStatusLabel(latestDestruction.status)
                      : "준비중"}
                  </span>
                </div>

                <div className="home-progress-bar">
                  <div
                    style={{
                      width: getDestructionProgressPercent(
                        latestDestruction?.status,
                      ),
                    }}
                  />
                </div>

                <p>
                  {latestDestruction
                    ? `${latestDestruction.title} · 참가자 ${latestDestruction._count.participants}명 · 팀 ${latestDestruction._count.teams}개`
                    : "등록된 멸망전이 없습니다."}
                </p>
              </Link>
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}
