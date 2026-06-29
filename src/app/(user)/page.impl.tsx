export const dynamic = "force-dynamic";

import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import GalleryWinnerSlider from "@/components/GalleryWinnerSlider";
import Top3Slider from "@/components/Top3Slider";
import RecentMvpSlider from "@/components/RecentMvpSlider";
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

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString("ko-KR");
}

export default async function HomePage() {
  const [
    topData,
    winnerImages,
    recentMatches,
    latestDestruction,
    latestMvpSeries,
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

  return (
    <main className="page-container home-page klol-v2-home">
      <section className="home-hero-grid">
        <div className="card home-main-card">
          <div>
            <p className="home-eyebrow">KOREA LOL CUSTOM STATS</p>
            <h1 className="home-main-title">K-LOL.GG</h1>
            <p className="home-main-description">
              모든 규정은 공정한 운영과 원활한 진행을 위한 기준입니다. 구성원
              모두의 협조를 바랍니다.
            </p>
            <p></p>
          </div>

          <div className="social-link-row">
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

            <a
              href="https://discord.com/invite/bgHV4nqwN9"
              target="_blank"
              rel="noopener noreferrer"
              className="social-link-card"
            >
              <Image
                src="/discord.webp"
                alt="디스코드"
                width={52}
                height={52}
                className="social-link-image"
              />
              <span>디스코드</span>
            </a>
          </div>
        </div>

        <div className="card home-season-card">
          <div className="home-section-head">
            <div>
              <p className="home-eyebrow">CURRENT SEASON</p>
              <h2 className="home-section-title">시즌 요약</h2>
            </div>
          </div>

          <div className="home-season-grid">
            <div className="home-stat-box">
              <span>현재 시즌</span>
              <strong>{topData.currentSeason?.name ?? "시즌 없음"}</strong>
            </div>

            <div className="home-stat-box">
              <span>내전 수</span>
              <strong>{seasonMatchCount}</strong>
            </div>

            <div className="home-stat-box">
              <span>세트 수</span>
              <strong>{seasonGameCount}</strong>
            </div>

            <div className="home-stat-box">
              <span>참여 인원</span>
              <strong>{seasonParticipantCount.length}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="home-top3-grid">
          <GalleryWinnerSlider images={winnerImages} />

          <Top3Slider
            title="현 시즌 TOP 3"
            seasonName={topData.currentSeason?.name ?? null}
            players={topData.currentPlayers}
          />
        </div>
      </section>

      <section className="section-block">
        <div className="home-top3-grid">
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

          <Top3Slider
            title="전 시즌 TOP 3"
            seasonName={topData.previousSeason?.name ?? "이전 시즌 없음"}
            players={topData.previousPlayers}
          />
        </div>
      </section>

      <section className="section-block">
        <RecentMvpSlider
          items={recentMvpSlides}
          dateLabel={recentMvpDateLabel}
        />
      </section>

      <section className="section-block">
        <div className="card">
          <div className="home-section-head">
            <div>
              <p className="home-eyebrow">RECENT MATCHES</p>
              <h2 className="home-section-title">최근 내전</h2>
            </div>

            <Link href="/matches" className="chip-button">
              전체 보기
            </Link>
          </div>

          {recentMatches.length === 0 ? (
            <div className="empty-box">등록된 내전이 없습니다.</div>
          ) : (
            <div className="home-recent-match-list">
              {recentMatches.map((match) => (
                <Link
                  key={match.id}
                  href={`/matches/${match.id}`}
                  className="list-card home-recent-match-card"
                >
                  <div>
                    <div className="list-card__title">{match.title}</div>

                    <div className="list-card__meta">
                      <div>시즌: {match.season.name}</div>
                      <div>날짜: {formatDateTime(match.matchDate)}</div>
                    </div>
                  </div>

                  <div className="home-recent-match-count">
                    <strong>{match._count.games}</strong>
                    <span>세트</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
