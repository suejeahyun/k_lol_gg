import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma/client";
import Top3Slider from "@/components/Top3Slider";

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
  previousSeason: SeasonDto;
  currentPlayers: TopPlayerDto[];
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
  const seasons = await prisma.season.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  if (seasons.length === 0) {
    return {
      currentSeason: null,
      previousSeason: null,
      currentPlayers: [],
      previousPlayers: [],
    };
  }

  const activeSeason = seasons.find((season) => season.isActive) ?? null;
  const currentSeason = activeSeason ?? seasons[0];
  const previousSeason =
    seasons.find((season) => season.id !== currentSeason.id) ?? null;

  const [currentPlayers, previousPlayers] = await Promise.all([
    getSeasonPlayers(currentSeason.id),
    previousSeason ? getSeasonPlayers(previousSeason.id) : Promise.resolve([]),
  ]);

  return {
    currentSeason: toSeasonDto(currentSeason),
    previousSeason: toSeasonDto(previousSeason),
    currentPlayers,
    previousPlayers,
  };
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("ko-KR");
}

export default async function HomePage() {
  const [topData, recentMatches] = await Promise.all([
    getTopPageData(),
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
        _count: {
          select: {
            games: true,
          },
        },
      },
    }),
  ]);

  const safeTopData = {
    currentSeason: topData.currentSeason,
    previousSeason: topData.previousSeason,
    currentPlayers: topData.currentPlayers,
    previousPlayers: topData.previousPlayers,
  };

  return (
    <main className="page-container">
      <section className="section-block">
        <div className="card">
          <div className="page-title" style={{ marginBottom: "12px" }}>
            K-LOL.GG
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
                width={56}
                height={56}
                className="social-link-image"
              />
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
                width={56}
                height={56}
                className="social-link-image"
              />
            </a>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="home-top3-grid">
          <Top3Slider
            title="전 시즌 TOP 3"
            seasonName={safeTopData.previousSeason?.name ?? null}
            players={safeTopData.previousPlayers}
          />

          <Top3Slider
            title="현 시즌 TOP 3"
            seasonName={safeTopData.currentSeason?.name ?? null}
            players={safeTopData.currentPlayers}
          />
        </div>
      </section>

      <section className="section-block">
        <div className="card">
          <div className="list-card__title" style={{ marginBottom: "16px" }}>
            최근 내전
          </div>

          {recentMatches.length === 0 ? (
            <p>등록된 내전이 없습니다.</p>
          ) : (
            <div className="card-grid">
              {recentMatches.map((match) => (
                <Link
                  key={match.id}
                  href={`/matches/${match.id}`}
                  className="list-card"
                >
                  <div className="list-card__title">{match.title}</div>

                  <div className="list-card__meta">
                    <div>시즌: {match.season.name}</div>
                    <div>날짜: {formatDate(match.matchDate)}</div>
                    <div>세트 수: {match._count.games}</div>
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