import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import GalleryWinnerSlider from "@/components/GalleryWinnerSlider";
import Top3Slider from "@/components/Top3Slider";

export const dynamic = "force-dynamic";
export const revalidate = 0;
type SeasonDto = {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
} | null;

type TopPlayerDto = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  totalGames: number;
  participation: number;
  wins: number;
  losses: number;
  winRate: number;
  kda: number;
};

type TopPageData = {
  currentSeason: SeasonDto;
  currentPlayers: TopPlayerDto[];
  previousSeason: SeasonDto;
  previousPlayers: TopPlayerDto[];
};

function toSeasonDto(
  season: {
    id: number;
    name: string;
    isActive: boolean;
    createdAt: Date;
  } | null
): SeasonDto {
  if (!season) return null;

  return {
    id: season.id,
    name: season.name,
    isActive: season.isActive,
    createdAt: season.createdAt.toISOString(),
  };
}

function getEventStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PLANNED: "기획중",
    RECRUITING: "모집중",
    TEAM_BUILDING: "팀 구성중",
    IN_PROGRESS: "진행중",
    COMPLETED: "종료",
    CANCELLED: "취소",
  };

  return labels[status] ?? status;
}

function getDestructionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PLANNED: "기획중",
    RECRUITING: "모집중",
    TEAM_BUILDING: "팀 구성중",
    PRELIMINARY: "예선 진행",
    TOURNAMENT: "토너먼트 진행",
    COMPLETED: "종료",
    CANCELLED: "취소",
  };

  return labels[status] ?? status;
}

function getEventProgressPercent(status?: string | null) {
  if (!status) return "10%";

  const values: Record<string, string> = {
    PLANNED: "15%",
    RECRUITING: "30%",
    TEAM_BUILDING: "50%",
    IN_PROGRESS: "70%",
    COMPLETED: "100%",
    CANCELLED: "0%",
  };

  return values[status] ?? "10%";
}

function getDestructionProgressPercent(status?: string | null) {
  if (!status) return "10%";

  const values: Record<string, string> = {
    PLANNED: "10%",
    RECRUITING: "25%",
    TEAM_BUILDING: "40%",
    PRELIMINARY: "60%",
    TOURNAMENT: "80%",
    COMPLETED: "100%",
    CANCELLED: "0%",
  };

  return values[status] ?? "10%";
}

function buildSeasonPlayers(
  players: Array<{
    id: number;
    name: string;
    nickname: string;
    tag: string;
    participants: Array<{
      kills: number;
      deaths: number;
      assists: number;
      team: "BLUE" | "RED";
      game: {
        winnerTeam: "BLUE" | "RED";
        seriesId: number;
      };
    }>;
  }>
): TopPlayerDto[] {
  return players
    .map((player) => {
      const totalGames = player.participants.length;

      const participation = new Set(
        player.participants.map((participant) => participant.game.seriesId)
      ).size;

      const wins = player.participants.filter(
        (participant) => participant.team === participant.game.winnerTeam
      ).length;

      const losses = totalGames - wins;

      const totalKills = player.participants.reduce(
        (sum, participant) => sum + participant.kills,
        0
      );

      const totalDeaths = player.participants.reduce(
        (sum, participant) => sum + participant.deaths,
        0
      );

      const totalAssists = player.participants.reduce(
        (sum, participant) => sum + participant.assists,
        0
      );

      const winRate =
        totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;

      const kda =
        totalDeaths === 0
          ? Number((totalKills + totalAssists).toFixed(2))
          : Number(((totalKills + totalAssists) / totalDeaths).toFixed(2));

      return {
        playerId: player.id,
        name: player.name,
        nickname: player.nickname,
        tag: player.tag,
        totalGames,
        participation,
        wins,
        losses,
        winRate,
        kda,
      };
    })
    .filter((player) => player.totalGames > 0);
}

async function getSeasonPlayers(seasonId: number): Promise<TopPlayerDto[]> {
  const players = await prisma.player.findMany({
    select: {
      id: true,
      name: true,
      nickname: true,
      tag: true,
      participants: {
        where: {
          game: {
            series: {
              seasonId,
            },
          },
        },
        select: {
          kills: true,
          deaths: true,
          assists: true,
          team: true,
          game: {
            select: {
              winnerTeam: true,
              seriesId: true,
            },
          },
        },
      },
    },
  });

  return buildSeasonPlayers(players);
}

async function getTopPageData(): Promise<TopPageData> {
  const currentSeason = await prisma.season.findFirst({
    where: {
      isActive: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const previousSeason = await prisma.season.findFirst({
    where: {
      isActive: false,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const currentPlayers = currentSeason
    ? await getSeasonPlayers(currentSeason.id)
    : [];

  const previousPlayers = previousSeason
    ? await getSeasonPlayers(previousSeason.id)
    : [];

  return {
    currentSeason: toSeasonDto(currentSeason),
    currentPlayers,
    previousSeason: toSeasonDto(previousSeason),
    previousPlayers,
  };
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("ko-KR");
}

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString("ko-KR");
}

function calcKda(kills: number, deaths: number, assists: number): number {
  if (deaths === 0) {
    return kills + assists;
  }

  return Number(((kills + assists) / deaths).toFixed(2));
}

export default async function HomePage() {
  const [
    topData,
    winnerImages,
    recentMatches,
    notices,
    latestEvent,
    latestDestruction,
  ] = await Promise.all([
    getTopPageData(),

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

    prisma.notice.findMany({
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        title: true,
        content: true,
        isPinned: true,
        createdAt: true,
      },
    }),

    prisma.eventMatch.findFirst({
      orderBy: {
        eventDate: "desc",
      },
      include: {
        participants: true,
        teams: true,
        matches: true,
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
  ]);

  const currentSeasonId = topData.currentSeason?.id ?? null;

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

  const recentMvpCandidates = recentMatches.flatMap((match) =>
    match.games.flatMap((game) =>
      game.participants.map((participant) => {
        const kda = calcKda(
          participant.kills,
          participant.deaths,
          participant.assists
        );

        return {
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
          kda,
          isWin: participant.team === game.winnerTeam,
        };
      })
    )
  );

  const recentMvp =
    recentMvpCandidates.length > 0
      ? recentMvpCandidates.sort((a, b) => {
          if (b.kda !== a.kda) return b.kda - a.kda;
          if (b.kills !== a.kills) return b.kills - a.kills;
          return b.assists - a.assists;
        })[0]
      : null;

  return (
    <main className="page-container home-page">
      <section className="home-hero-grid">
        <div className="card home-main-card">
          <div>
            <p className="home-eyebrow">KOREA LOL CUSTOM STATS</p>
            <h1 className="home-main-title">K-LOL.GG</h1>
            <p className="home-main-description">
              내전 기록, 시즌 랭킹, 최근 경기, 공지사항을 한 번에 확인하는
              K-LOL 통계 페이지입니다.
            </p>
          </div>

          <div className="social-link-row">
            <a
              href="https://open.kakao.com/o/gGQ80Ucf"
              target="_blank"
              rel="noopener noreferrer"
              className="social-link-card"
            >
              <Image
                src="/kakao.png"
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
                src="/discord.png"
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
              <Link href="/progress/event" className="home-progress-item">
                <div className="home-progress-item__top">
                  <strong>이벤트 내전</strong>
                  <span>
                    {latestEvent
                      ? getEventStatusLabel(latestEvent.status)
                      : "준비중"}
                  </span>
                </div>

                <div className="home-progress-bar">
                  <div
                    style={{
                      width: getEventProgressPercent(latestEvent?.status),
                    }}
                  />
                </div>

                <p>
                  {latestEvent
                    ? `${latestEvent.title} · 참가자 ${latestEvent.participants.length}명 · 팀 ${latestEvent.teams.length}개`
                    : "등록된 이벤트 내전이 없습니다."}
                </p>
              </Link>

              <Link
                href="/progress/destruction"
                className="home-progress-item"
              >
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
                        latestDestruction?.status
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
        <div className="card home-mvp-card">
          <div className="home-section-head">
            <div>
              <p className="home-eyebrow">RECENT MVP</p>
              <h2 className="home-section-title">최근 MVP</h2>
            </div>

            {recentMvp ? (
              <Link
                href={`/matches/${recentMvp.matchId}`}
                className="chip-button"
              >
                경기 보기
              </Link>
            ) : null}
          </div>

          {recentMvp ? (
            <div className="home-mvp-content">
              <div className="home-mvp-champion">
                {recentMvp.championImageUrl ? (
                  <Image
                    src={recentMvp.championImageUrl}
                    alt={recentMvp.championName}
                    width={72}
                    height={72}
                    className="home-mvp-champion__image"
                  />
                ) : (
                  <div className="home-mvp-champion__fallback" />
                )}
              </div>

              <div className="home-mvp-info">
                <div className="home-mvp-name">
                  {recentMvp.nickname}
                  <span>#{recentMvp.tag}</span>
                </div>

                <div className="home-mvp-meta">
                  {recentMvp.matchTitle} · {recentMvp.gameNumber}세트 ·{" "}
                  {recentMvp.championName}
                </div>
              </div>

              <div className="home-mvp-score">
                <strong>{recentMvp.kda}</strong>
                <span>
                  {recentMvp.kills}/{recentMvp.deaths}/{recentMvp.assists}
                </span>
                <em>{recentMvp.isWin ? "WIN" : "LOSE"}</em>
              </div>
            </div>
          ) : (
            <div className="empty-box">최근 MVP 데이터가 없습니다.</div>
          )}
        </div>
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

      <section className="section-block">
        <div className="card">
          <div className="home-section-head">
            <div>
              <p className="home-eyebrow">NOTICE</p>
              <h2 className="home-section-title">공지사항</h2>
            </div>

            <Link href="/notices" className="chip-button">
              전체 보기
            </Link>
          </div>

          {notices.length === 0 ? (
            <div className="empty-box">등록된 공지사항이 없습니다.</div>
          ) : (
            <div className="home-notice-list">
              {notices.map((notice) => (
                <Link
                  key={notice.id}
                  href={`/notices/${notice.id}`}
                  className="notice-card home-notice-card"
                >
                  <div className="notice-card__top">
                    {notice.isPinned ? (
                      <span className="notice-card__badge">고정</span>
                    ) : null}

                    <span className="notice-card__date">
                      {formatDate(notice.createdAt)}
                    </span>
                  </div>

                  <h3 className="notice-card__title">{notice.title}</h3>

                  <p className="notice-card__summary">
                    {notice.content.length > 90
                      ? `${notice.content.slice(0, 90)}...`
                      : notice.content}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}