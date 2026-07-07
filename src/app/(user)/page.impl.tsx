export const dynamic = "force-dynamic";

import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import GalleryWinnerSlider from "@/components/GalleryWinnerSlider";
import RecentMvpSlider from "@/components/RecentMvpSlider";
import { getCurrentUser } from "@/lib/auth/session";
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

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("ko-KR");
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

function getKoreaDayRange(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(
    parts.find((part) => part.type === "month")?.value ?? "1",
  );
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "1");

  const start = new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, -9, 0, 0, 0));

  return { start, end };
}

export default async function HomePage() {
  const [
    topData,
    winnerImages,
    recentMatches,
    latestDestruction,
    latestMvpSeries,
    currentUser,
  ] = await Promise.all([
    getCachedStatsTopData(),

    prisma.galleryImage.findMany({
      where: {
        showOnHome: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        title: true,
        description: true,
        imageUrl: true,
      },
    }),

    prisma.matchSeries.findMany({
      orderBy: {
        matchDate: "desc",
      },
      take: 5,
      include: {
        season: {
          select: {
            id: true,
            name: true,
          },
        },
        games: {
          orderBy: {
            gameNumber: "asc",
          },
          include: {
            participants: {
              include: {
                player: {
                  select: {
                    id: true,
                    name: true,
                    nickname: true,
                    tag: true,
                  },
                },
                champion: {
                  select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            games: true,
          },
        },
      },
    }),

    prisma.destructionTournament.findFirst({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        participants: true,
        teams: true,
        matches: true,
      },
    }),

    prisma.matchSeries.findFirst({
      where: {
        games: {
          some: {
            participants: {
              some: {},
            },
          },
        },
      },
      orderBy: {
        matchDate: "desc",
      },
      select: {
        matchDate: true,
      },
    }),

    getCurrentUser(),
  ]);

  const currentSeasonId = topData.currentSeason?.id ?? null;
  const latestMvpDateRange = latestMvpSeries
    ? getKoreaDayRange(latestMvpSeries.matchDate)
    : null;

  const latestMvpMatches = latestMvpDateRange
    ? await prisma.matchSeries.findMany({
        where: {
          matchDate: {
            gte: latestMvpDateRange.start,
            lt: latestMvpDateRange.end,
          },
          games: {
            some: {
              participants: {
                some: {},
              },
            },
          },
        },
        orderBy: [{ matchDate: "desc" }, { id: "desc" }],
        include: {
          games: {
            orderBy: {
              gameNumber: "asc",
            },
            include: {
              participants: {
                include: {
                  player: {
                    select: {
                      id: true,
                      name: true,
                      nickname: true,
                      tag: true,
                    },
                  },
                  champion: {
                    select: {
                      id: true,
                      name: true,
                      imageUrl: true,
                    },
                  },
                },
              },
            },
          },
        },
      })
    : [];

  const [seasonMatchCount, seasonGameCount, seasonParticipantCount] =
    currentSeasonId
      ? await Promise.all([
          prisma.matchSeries.count({
            where: {
              seasonId: currentSeasonId,
            },
          }),

          prisma.matchGame.count({
            where: {
              series: {
                seasonId: currentSeasonId,
              },
            },
          }),

          prisma.matchParticipant.findMany({
            where: {
              game: {
                series: {
                  seasonId: currentSeasonId,
                },
              },
            },
            distinct: ["playerId"],
            select: {
              playerId: true,
            },
          }),
        ])
      : [0, 0, []];

  const seasonTopThree = [...topData.currentPlayers]
    .filter((player) => player.participation >= 10)
    .sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.mvpCount !== a.mvpCount) return b.mvpCount - a.mvpCount;
      return b.participation - a.participation;
    })
    .slice(0, 3);

  const podiumSlots = [
    { rank: 2, player: seasonTopThree[1], tone: "silver" },
    { rank: 1, player: seasonTopThree[0], tone: "gold" },
    { rank: 3, player: seasonTopThree[2], tone: "bronze" },
  ];

  const topPlayerTiers =
    seasonTopThree.length > 0
      ? await prisma.player.findMany({
          where: {
            id: {
              in: seasonTopThree.map((player) => player.playerId),
            },
          },
          select: {
            id: true,
            currentTier: true,
            peakTier: true,
          },
        })
      : [];

  const topPlayerTierMap = new Map(
    topPlayerTiers.map((player) => [
      player.id,
      player.currentTier ?? player.peakTier ?? null,
    ]),
  );

  const mySeasonParticipants =
    currentSeasonId && currentUser?.playerId
      ? await prisma.matchParticipant.findMany({
          where: {
            playerId: currentUser.playerId,
            game: {
              series: {
                seasonId: currentSeasonId,
              },
            },
          },
          select: {
            kills: true,
            deaths: true,
            assists: true,
            game: {
              select: {
                seriesId: true,
              },
            },
          },
        })
      : [];

  const mySeasonMvpCount =
    currentSeasonId && currentUser?.playerId
      ? await prisma.matchGame.count({
          where: {
            mvpPlayerId: currentUser.playerId,
            series: {
              seasonId: currentSeasonId,
            },
          },
        })
      : 0;

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
          matchDate: match.matchDate.toISOString(),
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
        { label: "내전 수", value: seasonMatchCount },
        { label: "세트 수", value: seasonGameCount },
        { label: "참여 인원", value: seasonParticipantCount.length },
      ];

  return (
    <main className="page-container home-page home-dark-modern-page">
      <section className="home-dark-showcase" aria-label="K-LOL.GG 메인">
        <div className="home-dark-showcase-hero">
          <div className="home-dark-hero-copy">
            <p className="home-eyebrow">KOREA LOL CUSTOM STATS</p>
            <h1 className="home-dark-hero-title">
              실력을 <span>증명하라</span>
            </h1>
            <p className="home-main-description">
              내전 기록, 시즌 랭킹, 멸망전 진행과 MVP까지 한 화면에서
              확인하세요. K-LOL.GG는 카카오톡 오픈채팅방 내전 운영을 위한 기록
              허브입니다.
            </p>

            <div className="home-dark-actions">
              <Link href="/matches" className="home-dark-primary-action">
                내전 보러가기
              </Link>
              <Link href="/players" className="home-dark-secondary-action">
                플레이어 검색
              </Link>
            </div>

            <div className="social-link-row home-dark-social-row">
              <a
                href="https://open.kakao.com/o/gGQ80Ucf"
                target="_blank"
                rel="noopener noreferrer"
                className="social-link-card"
              >
                <Image
                  src="/kakao.webp"
                  alt="카카오톡"
                  width={52}
                  height={52}
                  className="social-link-image"
                />
                <span>카카오톡</span>
              </a>
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

            {seasonTopThree.length === 0 ? (
              <div className="empty-box">
                내전 참여 10회 이상 기준에 맞는 랭킹 데이터가 없습니다.
              </div>
            ) : (
              <div className="home-dark-podium">
                {podiumSlots.map((slot) => {
                  if (!slot.player) return null;

                  const tierName =
                    topPlayerTierMap.get(slot.player.playerId) ?? "Unranked";
                  const tierImageSrc = getTierImageSrc(tierName);

                  return (
                    <Link
                      key={slot.rank}
                      href={`/players/${slot.player.playerId}`}
                    className={`home-dark-rank-card home-dark-rank-card--${slot.tone}`}
                  >
                    <span className="home-dark-rank-card__halo" />
                      <span className="home-dark-rank-card__rank">
                        {slot.rank}
                      </span>
                      {slot.rank === 1 && (
                        <span
                          className="home-dark-rank-card__crown"
                          aria-hidden="true"
                        />
                      )}
                      <span className="home-dark-rank-card__emblem">
                        <Image
                          src={tierImageSrc}
                          alt={tierName}
                          width={86}
                          height={86}
                        />
                      </span>
                      <span className="home-dark-rank-card__label">
                        {slot.rank === 1 ? "SEASON ACE" : `${slot.rank} RANK`}
                      </span>
                    <strong className="home-dark-rank-card__name">
                      {slot.player.name}
                    </strong>
                    <small className="home-dark-rank-card__nickname">
                      {slot.player.nickname}#{slot.player.tag}
                    </small>
                    <div className="home-dark-rank-card__stats">
                      <span>
                        <b>{slot.player.winRate}%</b>
                        <small>승률</small>
                      </span>
                      <span>
                        <b>{slot.player.wins}</b>
                        <small>승</small>
                      </span>
                      <span>
                        <b>{slot.player.mvpCount}</b>
                        <small>MVP</small>
                      </span>
                    </div>
                  </Link>
                  );
                })}
              </div>
            )}
          </div>

          <aside
            className="home-dark-recent-panel home-dark-recent-panel--standalone"
            aria-label="최근 내전"
          >
            <div className="home-dark-panel-head">
              <div>
                <p className="home-eyebrow">RECENT MATCHES</p>
                <h2 className="home-section-title">최근 내전</h2>
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
                        : "진행중";

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
          </aside>

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
                    ? `${latestDestruction.title} · 참가자 ${latestDestruction.participants.length}명 · 팀 ${latestDestruction.teams.length}개`
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
