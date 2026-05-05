import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getGameMvpParticipant } from "@/lib/mvp";

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
  mvpCount: number;
};

function toSeasonDto(
  season: {
    id: number;
    name: string;
    isActive: boolean;
    createdAt: Date;
  } | null,
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
        id: number;
        winnerTeam: "BLUE" | "RED";
        seriesId: number;
      };
    }>;
  }>,
): SeasonPlayerDto[] {
  const mvpCountByPlayer = new Map<number, number>();
  const participantsByGame = new Map<
    number,
    Array<{
      playerId: number;
      kills: number;
      deaths: number;
      assists: number;
      team: string;
      winnerTeam: string;
    }>
  >();

  for (const player of players) {
    for (const participant of player.participants) {
      const items = participantsByGame.get(participant.game.id) ?? [];
      items.push({
        playerId: player.id,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        team: participant.team,
        winnerTeam: participant.game.winnerTeam,
      });
      participantsByGame.set(participant.game.id, items);
    }
  }

  for (const participants of participantsByGame.values()) {
    const mvp = getGameMvpParticipant(participants, participants[0]?.winnerTeam ?? "");
    if (mvp) {
      mvpCountByPlayer.set(mvp.playerId, (mvpCountByPlayer.get(mvp.playerId) ?? 0) + 1);
    }
  }

  return players
    .map((player) => {
      const totalGames = player.participants.length;
      const participation = new Set(
        player.participants.map((participant) => participant.game.seriesId),
      ).size;
      const wins = player.participants.filter(
        (participant) => participant.team === participant.game.winnerTeam,
      ).length;
      const losses = totalGames - wins;
      const winRate =
        totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;

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
        mvpCount: mvpCountByPlayer.get(player.id) ?? 0,
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
              id: true,
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
      { status: 500 },
    );
  }
}
