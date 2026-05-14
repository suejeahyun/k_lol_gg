import { prisma } from "@/lib/prisma/client";
import {
  calculateWinRate,
  findParticipantByPuuid,
  getMatchById,
  getRecentRankedMatchIdsByPuuid,
  getRiotAccountByRiotId,
  getSoloRankEntryByPuuid,
  getSummonerByPuuid,
  isSoloRankMatch,
} from "@/lib/riot/client";

type SoloSyncStatus = "synced" | "skipped" | "failed";

export type SoloSyncResult = {
  playerId: number;
  status: SoloSyncStatus;
  reason?: string;
  savedMatchCount?: number;
  skippedMatchCount?: number;
};

type SyncOptions = {
  cooldownMinutes?: number;
  matchCount?: number;
};

const DEFAULT_COOLDOWN_MINUTES = 10;
const DEFAULT_MATCH_COUNT = 20;

function isCooldownActive(lastSyncedAt: Date | null | undefined, cooldownMinutes: number) {
  if (!lastSyncedAt) return false;
  return Date.now() - new Date(lastSyncedAt).getTime() < cooldownMinutes * 60 * 1000;
}

function getPrimaryRuneId(
  participant: NonNullable<ReturnType<typeof findParticipantByPuuid>>,
) {
  return participant.perks?.styles?.[0]?.selections?.[0]?.perk ?? null;
}

function getSubRuneId(
  participant: NonNullable<ReturnType<typeof findParticipantByPuuid>>,
) {
  return participant.perks?.styles?.[1]?.style ?? null;
}

export async function syncPlayerSoloRankBestEffort(
  playerId: number,
  options: SyncOptions = {},
): Promise<SoloSyncResult> {
  const cooldownMinutes = options.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES;
  const matchCount = options.matchCount ?? DEFAULT_MATCH_COUNT;

  try {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: { riotAccount: true },
    });

    if (!player) return { playerId, status: "failed", reason: "PLAYER_NOT_FOUND" };
    if (!player.nickname || !player.tag) {
      return { playerId, status: "skipped", reason: "RIOT_ID_MISSING" };
    }

    if (isCooldownActive(player.riotAccount?.lastSyncedAt, cooldownMinutes)) {
      return { playerId, status: "skipped", reason: "COOLDOWN" };
    }

    const account = await getRiotAccountByRiotId(player.nickname, player.tag);
    const summoner = await getSummonerByPuuid(account.puuid);
    const soloRankEntry = await getSoloRankEntryByPuuid(account.puuid);
    const matchIds = await getRecentRankedMatchIdsByPuuid(account.puuid, matchCount);

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
          totalDamageDealtToChampions: participant.totalDamageDealtToChampions,
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
          totalDamageDealtToChampions: participant.totalDamageDealtToChampions,
          totalDamageTaken: participant.totalDamageTaken,
          visionScore: participant.visionScore,
        },
      });

      savedMatchCount += 1;
    }

    await prisma.playerRiotAccount.upsert({
      where: { playerId: player.id },
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
        where: { playerId: player.id },
        update: {
          queueType: soloRankEntry.queueType,
          tier: soloRankEntry.tier,
          rank: soloRankEntry.rank,
          leaguePoints: soloRankEntry.leaguePoints,
          wins: soloRankEntry.wins,
          losses: soloRankEntry.losses,
          winRate: calculateWinRate(soloRankEntry.wins, soloRankEntry.losses),
        },
        create: {
          playerId: player.id,
          queueType: soloRankEntry.queueType,
          tier: soloRankEntry.tier,
          rank: soloRankEntry.rank,
          leaguePoints: soloRankEntry.leaguePoints,
          wins: soloRankEntry.wins,
          losses: soloRankEntry.losses,
          winRate: calculateWinRate(soloRankEntry.wins, soloRankEntry.losses),
        },
      });
    }

    return { playerId, status: "synced", savedMatchCount, skippedMatchCount };
  } catch (error) {
    return {
      playerId,
      status: "failed",
      reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}
