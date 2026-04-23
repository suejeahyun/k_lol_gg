import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type SeasonDto = {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
};

type SeasonPlayerDto = {
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

function toSeasonDto(
  season: {
    id: number;
    name: string;
    isActive: boolean;
    createdAt: Date;
  } | null
): SeasonDto | null {
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
): SeasonPlayerDto[] {
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

async function getSeasonPlayers(seasonId: number): Promise<SeasonPlayerDto[]> {
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

export async function GET() {
  try {
    const seasons = await prisma.season.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });

    if (seasons.length === 0) {
      return NextResponse.json({
        currentSeason: null,
        previousSeason: null,
        currentPlayers: [],
        previousPlayers: [],
      });
    }

    const activeSeason = seasons.find((season) => season.isActive) ?? null;
    const currentSeason = activeSeason ?? seasons[0];
    const previousSeason =
      seasons.find((season) => season.id !== currentSeason.id) ?? null;

    const [currentPlayers, previousPlayers] = await Promise.all([
      getSeasonPlayers(currentSeason.id),
      previousSeason ? getSeasonPlayers(previousSeason.id) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      currentSeason: toSeasonDto(currentSeason),
      previousSeason: toSeasonDto(previousSeason),
      currentPlayers,
      previousPlayers,
    });
  } catch (error) {
    console.error("[STATS_TOP_GET_ERROR]", error);

    return NextResponse.json(
      { message: "시즌 TOP 데이터 조회 실패" },
      { status: 500 }
    );
  }
}