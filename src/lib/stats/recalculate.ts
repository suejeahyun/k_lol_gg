import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { getGameMvpParticipant } from "@/lib/mvp";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function recalculateSeasonStats(seasonId: number, db: DbClient = prisma) {
  const season = await db.season.findUnique({
    where: { id: seasonId },
    select: { id: true, name: true },
  });

  if (!season) {
    throw new Error("존재하지 않는 시즌입니다.");
  }

  const participants = await db.matchParticipant.findMany({
    where: {
      game: {
        series: {
          seasonId,
        },
      },
    },
    include: {
      game: {
        select: {
          id: true,
          seriesId: true,
          winnerTeam: true,
        },
      },
    },
  });

  const mvpPlayerIdByGame = new Map<number, number>();
  const participantsByGame = new Map<number, typeof participants>();

  for (const participant of participants) {
    const items = participantsByGame.get(participant.game.id) ?? [];
    items.push(participant);
    participantsByGame.set(participant.game.id, items);
  }

  for (const [gameId, gameParticipants] of participantsByGame.entries()) {
    const mvp = getGameMvpParticipant(
      gameParticipants.map((participant) => ({
        playerId: participant.playerId,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        team: participant.team,
      })),
      gameParticipants[0]?.game.winnerTeam ?? "",
    );

    if (mvp) {
      mvpPlayerIdByGame.set(gameId, mvp.playerId);
    }
  }

  const seasonByPlayer = new Map<
    number,
    { games: number; seriesIds: Set<number>; wins: number; mvpCount: number }
  >();
  const championByKey = new Map<
    string,
    {
      playerId: number;
      championId: number;
      games: number;
      wins: number;
      mvpCount: number;
    }
  >();
  const positionByKey = new Map<
    string,
    { playerId: number; position: "TOP" | "JGL" | "MID" | "ADC" | "SUP"; games: number; wins: number }
  >();

  for (const participant of participants) {
    const win = participant.team === participant.game.winnerTeam;
    const isMvp = mvpPlayerIdByGame.get(participant.game.id) === participant.playerId;

    const playerStat = seasonByPlayer.get(participant.playerId) ?? {
      games: 0,
      seriesIds: new Set<number>(),
      wins: 0,
      mvpCount: 0,
    };
    playerStat.games += 1;
    playerStat.seriesIds.add(participant.game.seriesId);
    playerStat.wins += win ? 1 : 0;
    playerStat.mvpCount += isMvp ? 1 : 0;
    seasonByPlayer.set(participant.playerId, playerStat);

    const championKey = `${participant.playerId}:${seasonId}:${participant.championId}`;
    const championStat = championByKey.get(championKey) ?? {
      playerId: participant.playerId,
      championId: participant.championId,
      games: 0,
      wins: 0,
      mvpCount: 0,
    };
    championStat.games += 1;
    championStat.wins += win ? 1 : 0;
    championStat.mvpCount += isMvp ? 1 : 0;
    championByKey.set(championKey, championStat);

    const positionKey = `${participant.playerId}:${seasonId}:${participant.position}`;
    const positionStat = positionByKey.get(positionKey) ?? {
      playerId: participant.playerId,
      position: participant.position,
      games: 0,
      wins: 0,
    };
    positionStat.games += 1;
    positionStat.wins += win ? 1 : 0;
    positionByKey.set(positionKey, positionStat);
  }

  await db.playerSeasonStat.deleteMany({ where: { seasonId } });

  if (seasonByPlayer.size > 0) {
    await db.playerSeasonStat.createMany({
      data: [...seasonByPlayer.entries()].map(([playerId, stat]) => ({
        playerId,
        seasonId,
        totalGames: stat.games,
        participationCount: stat.seriesIds.size,
        wins: stat.wins,
        losses: stat.games - stat.wins,
        mvpCount: stat.mvpCount,
      })),
    });
  }


  await db.playerChampionStat.deleteMany({
    where: { seasonId },
  });
  if (championByKey.size > 0) {
    await db.playerChampionStat.createMany({
      data: [...championByKey.values()].map((stat) => ({
        playerId: stat.playerId,
        seasonId,
        championId: stat.championId,
        games: stat.games,
        wins: stat.wins,
        mvpCount: stat.mvpCount,
      })),
    });
  }

  await db.playerPositionStat.deleteMany({
    where: { seasonId },
  });
  if (positionByKey.size > 0) {
    await db.playerPositionStat.createMany({
      data: [...positionByKey.values()].map((stat) => ({
        playerId: stat.playerId,
        seasonId,
        position: stat.position,
        games: stat.games,
        wins: stat.wins,
      })),
    });
  }

  return {
    season,
    participants: participants.length,
    playerStats: seasonByPlayer.size,
    championStats: championByKey.size,
    positionStats: positionByKey.size,
  };
}

export async function getCurrentSeasonId() {
  const season = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" },
    select: { id: true },
  });

  return season?.id ?? null;
}
