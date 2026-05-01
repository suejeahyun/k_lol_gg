import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import {
  calculateWinRate,
  findParticipantByPuuid,
  getMatchById,
  getRecentRankedMatchIdsByPuuid,
  getRiotAccountByRiotId,
  getSummonerByPuuid,
  isSoloRankMatch,
  getSoloRankEntryByPuuid,
} from "@/lib/riot/client";

type RouteContext = {
  params: Promise<{
    playerId: string;
  }>;
};

const SYNC_COOLDOWN_MINUTES = 10;
const RECENT_SOLO_MATCH_COUNT = 20;

function isCooldownActive(lastSyncedAt: Date | null | undefined) {
  if (!lastSyncedAt) {
    return false;
  }

  const now = Date.now();
  const lastSyncedTime = new Date(lastSyncedAt).getTime();
  const diffMinutes = (now - lastSyncedTime) / 1000 / 60;

  return diffMinutes < SYNC_COOLDOWN_MINUTES;
}

function getCooldownRemainSeconds(lastSyncedAt: Date) {
  const nextAvailableTime =
    new Date(lastSyncedAt).getTime() + SYNC_COOLDOWN_MINUTES * 60 * 1000;

  const remainMs = nextAvailableTime - Date.now();

  return Math.max(0, Math.ceil(remainMs / 1000));
}

function getPrimaryRuneId(
  participant: NonNullable<
    ReturnType<typeof findParticipantByPuuid>
  >
) {
  return participant.perks?.styles?.[0]?.selections?.[0]?.perk ?? null;
}

function getSubRuneId(
  participant: NonNullable<
    ReturnType<typeof findParticipantByPuuid>
  >
) {
  return participant.perks?.styles?.[1]?.style ?? null;
}

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const { playerId } = await context.params;
    const parsedPlayerId = Number(playerId);

    if (!Number.isInteger(parsedPlayerId) || parsedPlayerId <= 0) {
      return NextResponse.json(
        { message: "유효하지 않은 플레이어 ID입니다." },
        { status: 400 }
      );
    }

    const player = await prisma.player.findUnique({
      where: { id: parsedPlayerId },
      include: {
        riotAccount: true,
      },
    });

    if (!player) {
      return NextResponse.json(
        { message: "플레이어를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (!player.nickname || !player.tag) {
      return NextResponse.json(
        {
          message:
            "플레이어의 닉네임 또는 태그가 없어 Riot ID를 조회할 수 없습니다.",
        },
        { status: 400 }
      );
    }

    if (isCooldownActive(player.riotAccount?.lastSyncedAt)) {
      const remainSeconds = getCooldownRemainSeconds(
        player.riotAccount!.lastSyncedAt!
      );

      return NextResponse.json(
        {
          message: "솔랭 전적은 10분에 한 번만 갱신할 수 있습니다.",
          remainSeconds,
        },
        { status: 429 }
      );
    }

    const account = await getRiotAccountByRiotId(player.nickname, player.tag);
    const summoner = await getSummonerByPuuid(account.puuid);
    const soloRankEntry = await getSoloRankEntryByPuuid(account.puuid);

    const matchIds = await getRecentRankedMatchIdsByPuuid(
      account.puuid,
      RECENT_SOLO_MATCH_COUNT
    );

    let savedMatchCount = 0;
    let skippedMatchCount = 0;

    for (const matchId of matchIds) {
      const match = await getMatchById(matchId);

      if (!isSoloRankMatch(match)) {
        skippedMatchCount += 1;
        continue;
      }

      const participant = findParticipantByPuuid(match, account.puuid);

      if (!participant) {
        skippedMatchCount += 1;
        continue;
      }

      await prisma.playerSoloMatch.upsert({
        where: {
          playerId_matchId: {
            playerId: player.id,
            matchId,
          },
        },
        update: {
          queueId: match.info.queueId,

          championId: participant.championId,
          championName: participant.championName,

          position: participant.teamPosition || null,
          role: participant.role || null,

          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,

          win: participant.win,
          gameDuration: match.info.gameDuration,
          gameCreation: new Date(match.info.gameCreation),

          summonerSpell1: participant.summoner1Id,
          summonerSpell2: participant.summoner2Id,

          primaryRuneId: getPrimaryRuneId(participant),
          subRuneId: getSubRuneId(participant),

          item0: participant.item0,
          item1: participant.item1,
          item2: participant.item2,
          item3: participant.item3,
          item4: participant.item4,
          item5: participant.item5,
          item6: participant.item6,

          totalDamageDealtToChampions:
            participant.totalDamageDealtToChampions,
          totalDamageTaken: participant.totalDamageTaken,
          visionScore: participant.visionScore,
        },
        create: {
          playerId: player.id,
          matchId,
          queueId: match.info.queueId,

          championId: participant.championId,
          championName: participant.championName,

          position: participant.teamPosition || null,
          role: participant.role || null,

          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,

          win: participant.win,
          gameDuration: match.info.gameDuration,
          gameCreation: new Date(match.info.gameCreation),

          summonerSpell1: participant.summoner1Id,
          summonerSpell2: participant.summoner2Id,

          primaryRuneId: getPrimaryRuneId(participant),
          subRuneId: getSubRuneId(participant),

          item0: participant.item0,
          item1: participant.item1,
          item2: participant.item2,
          item3: participant.item3,
          item4: participant.item4,
          item5: participant.item5,
          item6: participant.item6,

          totalDamageDealtToChampions:
            participant.totalDamageDealtToChampions,
          totalDamageTaken: participant.totalDamageTaken,
          visionScore: participant.visionScore,
        },
      });

      savedMatchCount += 1;
    }

    await prisma.playerRiotAccount.upsert({
      where: {
        playerId: player.id,
      },
      update: {
        gameName: account.gameName,
        tagLine: account.tagLine,
        puuid: account.puuid,

        summonerId: null,
        accountId: summoner.accountId,
        profileIconId: summoner.profileIconId,
        summonerLevel: summoner.summonerLevel,

        lastSyncedAt: new Date(),
      },
      create: {
        playerId: player.id,

        gameName: account.gameName,
        tagLine: account.tagLine,
        puuid: account.puuid,

        summonerId: null,
        accountId: summoner.accountId,
        profileIconId: summoner.profileIconId,
        summonerLevel: summoner.summonerLevel,

        lastSyncedAt: new Date(),
      },
    });

    if (soloRankEntry) {
      await prisma.playerSoloRankSnapshot.upsert({
        where: {
          playerId: player.id,
        },
        update: {
          queueType: soloRankEntry.queueType,
          tier: soloRankEntry.tier,
          rank: soloRankEntry.rank,
          leaguePoints: soloRankEntry.leaguePoints,
          wins: soloRankEntry.wins,
          losses: soloRankEntry.losses,
          winRate: calculateWinRate(
            soloRankEntry.wins,
            soloRankEntry.losses
          ),
        },
        create: {
          playerId: player.id,
          queueType: soloRankEntry.queueType,
          tier: soloRankEntry.tier,
          rank: soloRankEntry.rank,
          leaguePoints: soloRankEntry.leaguePoints,
          wins: soloRankEntry.wins,
          losses: soloRankEntry.losses,
          winRate: calculateWinRate(
            soloRankEntry.wins,
            soloRankEntry.losses
          ),
        },
      });
    }

    return NextResponse.json({
      message: "솔랭 전적 갱신이 완료되었습니다.",
      player: {
        id: player.id,
        name: player.name,
        riotId: `${account.gameName}#${account.tagLine}`,
      },
      synced: {
        requestedMatchCount: matchIds.length,
        savedMatchCount,
        skippedMatchCount,
      },
      soloRank: soloRankEntry
        ? {
            queueType: soloRankEntry.queueType,
            tier: soloRankEntry.tier,
            rank: soloRankEntry.rank,
            leaguePoints: soloRankEntry.leaguePoints,
            wins: soloRankEntry.wins,
            losses: soloRankEntry.losses,
            winRate: calculateWinRate(
              soloRankEntry.wins,
              soloRankEntry.losses
            ),
          }
        : null,
    });
  } catch (error) {
    console.error("[RIOT_PLAYER_SOLO_SYNC_POST_ERROR]", error);

    if (error instanceof Error) {
      if (error.message.includes("RIOT_API_KEY")) {
        return NextResponse.json(
          { message: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          message: "솔랭 전적 갱신 중 오류가 발생했습니다.",
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "솔랭 전적 갱신 중 알 수 없는 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}