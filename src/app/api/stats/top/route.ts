import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type SeasonDto = {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
};

type TopPlayerDto = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  kda: number;
  avgGold: number;
};

function toSeasonDto(
  season: {
    id: number;
    name: string;
    isActive: boolean;
    createdAt: Date;
  } | null
): SeasonDto | null {
  if (!season) {
    return null;
  }

  return {
    id: season.id,
    name: season.name,
    isActive: season.isActive,
    createdAt: season.createdAt.toISOString(),
  };
}

function buildTopPlayersFromSeasonParticipants(
  players: Array<{
    id: number;
    name: string;
    nickname: string;
    tag: string;
    participants: Array<{
      kills: number;
      deaths: number;
      assists: number;
      gold: number;
      team: "BLUE" | "RED";
      game: {
        winnerTeam: "BLUE" | "RED";
      };
    }>;
  }>
): TopPlayerDto[] {
  const mapped = players
    .map((player) => {
      const totalGames = player.participants.length;

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

      const totalGold = player.participants.reduce(
        (sum, participant) => sum + participant.gold,
        0
      );

      const winRate =
        totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;

      const kda =
        totalDeaths === 0
          ? Number((totalKills + totalAssists).toFixed(2))
          : Number(((totalKills + totalAssists) / totalDeaths).toFixed(2));

      const avgGold = totalGames > 0 ? Math.round(totalGold / totalGames) : 0;

      return {
        playerId: player.id,
        name: player.name,
        nickname: player.nickname,
        tag: player.tag,
        totalGames,
        wins,
        losses,
        winRate,
        kda,
        avgGold,
      };
    })
    .filter((player) => player.totalGames > 0)
    .sort((a, b) => {
      if (b.winRate !== a.winRate) {
        return b.winRate - a.winRate;
      }

      if (b.totalGames !== a.totalGames) {
        return b.totalGames - a.totalGames;
      }

      if (b.kda !== a.kda) {
        return b.kda - a.kda;
      }

      return b.avgGold - a.avgGold;
    })
    .slice(0, 3);

  return mapped;
}

async function getSeasonTop3(seasonId: number): Promise<TopPlayerDto[]> {
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
          gold: true,
          team: true,
          game: {
            select: {
              winnerTeam: true,
            },
          },
        },
      },
    },
  });

  return buildTopPlayersFromSeasonParticipants(players);
}

export async function GET() {
  try {
    const seasons = await prisma.season.findMany({
      orderBy: [
        { isActive: "desc" },
        { createdAt: "desc" },
      ],
      take: 10,
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (seasons.length === 0) {
      return NextResponse.json({
        currentSeason: null,
        previousSeason: null,
        currentTop3: [],
        previousTop3: [],
      });
    }

    const activeSeason =
      seasons.find((season) => season.isActive) ?? null;

    const currentSeason = activeSeason ?? seasons[0];

    const previousSeason =
      seasons.find((season) => season.id !== currentSeason.id) ?? null;

    const [currentTop3, previousTop3] = await Promise.all([
      getSeasonTop3(currentSeason.id),
      previousSeason ? getSeasonTop3(previousSeason.id) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      currentSeason: toSeasonDto(currentSeason),
      previousSeason: toSeasonDto(previousSeason),
      currentTop3,
      previousTop3,
    });
  } catch (error) {
    console.error("[STATS_TOP_GET_ERROR]", error);

    return NextResponse.json(
      { message: "TOP 3 조회 실패" },
      { status: 500 }
    );
  }
}