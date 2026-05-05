import { getGameMvpPlayerId } from "@/lib/mvp";
import { prisma } from "@/lib/prisma/client";
import { PlayerSummaryResult } from "@/types/kakao";

function roundToOne(value: number) {
  return Math.round(value * 10) / 10;
}

export async function getPlayerSummaryByRiotId(
  nickname: string,
  tag: string,
): Promise<PlayerSummaryResult | null> {
  const player = await prisma.player.findFirst({
    where: {
      nickname,
      tag,
    },
    include: {
      participants: {
        select: {
          kills: true,
          deaths: true,
          assists: true,
          team: true,
          game: {
            select: {
              winnerTeam: true,
              participants: {
                select: {
                  playerId: true,
                  kills: true,
                  deaths: true,
                  assists: true,
                  team: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!player) {
    return null;
  }

  const participants = player.participants ?? [];
  const totalGames = participants.length;

  const totalKills = participants.reduce((sum, item) => sum + item.kills, 0);
  const totalDeaths = participants.reduce((sum, item) => sum + item.deaths, 0);
  const totalAssists = participants.reduce((sum, item) => sum + item.assists, 0);

  const wins = participants.filter(
    (item) => item.team === item.game.winnerTeam,
  ).length;

  const losses = totalGames - wins;

  const winRate = totalGames > 0 ? roundToOne((wins / totalGames) * 100) : 0;

  const mvpCount = participants.filter((participant) => {
    const mvpPlayerId = getGameMvpPlayerId(
      participant.game.participants,
      participant.game.winnerTeam,
    );

    return mvpPlayerId === player.id;
  }).length;

  const avgKills = totalGames > 0 ? roundToOne(totalKills / totalGames) : 0;
  const avgDeaths = totalGames > 0 ? roundToOne(totalDeaths / totalGames) : 0;
  const avgAssists = totalGames > 0 ? roundToOne(totalAssists / totalGames) : 0;

  return {
    playerId: player.id,
    name: player.name,
    nickname: player.nickname,
    tag: player.tag,
    totalGames,
    wins,
    losses,
    winRate,
    mvpCount,
    avgKills,
    avgDeaths,
    avgAssists,
  };
}
