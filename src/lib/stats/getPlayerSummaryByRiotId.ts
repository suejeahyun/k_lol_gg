import { prisma } from "@/lib/prisma/client";
import { PlayerSummaryResult } from "@/types/kakao";

function roundToOne(value: number) {
  return Math.round(value * 10) / 10;
}

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

export async function getPlayerSummaryByRiotId(
  nickname: string,
  tag: string
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
    (item) => item.team === item.game.winnerTeam
  ).length;

  const losses = totalGames - wins;

  const winRate = totalGames > 0 ? roundToOne((wins / totalGames) * 100) : 0;

  const kdaBaseDeaths = totalDeaths === 0 ? 1 : totalDeaths;
  const kda =
    totalGames > 0 ? roundToTwo((totalKills + totalAssists) / kdaBaseDeaths) : 0;

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
    kda,
    avgKills,
    avgDeaths,
    avgAssists,
  };
}