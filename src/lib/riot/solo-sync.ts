import { prisma } from "@/lib/prisma/client";
import {
  createRiotSyncJob,
  markRiotAccountSyncState,
  updateRiotSyncJob,
} from "@/lib/riot/audit";
import {
  calculateWinRate,
  findParticipantByPuuid,
  getMatchById,
  getRankedMatchIdsByPuuid,
  getSoloRankEntryByPuuid,
  getSummonerByPuuid,
  isSoloRankMatch,
  type RiotLeagueEntryDto,
  type RiotMatchDto,
  type RiotMatchParticipantDto,
} from "@/lib/riot/client";
import { getRiotMatchFetchLimit } from "@/lib/riot/feature";
import { getRiotStatusFromError, recordRiotApiStatus } from "@/lib/riot/status";

export type SoloSyncStatus = "synced" | "skipped" | "failed";

export type SoloSyncResult = {
  playerId: number;
  status: SoloSyncStatus;
  message: string;
  reason?: string;
  requestedMatchCount?: number;
  savedMatchCount?: number;
  skippedMatchCount?: number;
  remainSeconds?: number;
  soloRank?: {
    queueType: string;
    tier: string | null;
    rank: string | null;
    leaguePoints: number;
    wins: number;
    losses: number;
    winRate: number;
  } | null;
};

type SyncOptions = {
  actorUserAccountId?: number | null;
  source?: string;
  jobType?: string;
  createJob?: boolean;
  cooldownMinutes?: number;
  matchCount?: number;
  includeMatches?: boolean;
  force?: boolean;
};

type PlayerForRiotSync = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  riotAccount: {
    id: number;
    playerId: number;
    gameName: string;
    tagLine: string;
    puuid: string;
    summonerId: string | null;
    accountId: string | null;
    profileIconId: number | null;
    summonerLevel: number | null;
    isVerified: boolean;
    lastSyncedAt: Date | null;
  } | null;
};

const DEFAULT_USER_COOLDOWN_MINUTES = 60;
const DEFAULT_ADMIN_COOLDOWN_MINUTES = 10;
const RIOT_MATCH_FETCH_BATCH_SIZE = 100;

function getEnvNumber(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function getUserRiotSyncCooldownMinutes() {
  return getEnvNumber(
    "RIOT_USER_SYNC_COOLDOWN_MINUTES",
    DEFAULT_USER_COOLDOWN_MINUTES,
    0,
    24 * 60,
  );
}

export function getAdminRiotSyncCooldownMinutes() {
  return getEnvNumber(
    "RIOT_ADMIN_SYNC_COOLDOWN_MINUTES",
    DEFAULT_ADMIN_COOLDOWN_MINUTES,
    0,
    24 * 60,
  );
}

export function getAdminFullRiotSyncCooldownMinutes() {
  return getEnvNumber(
    "RIOT_ADMIN_FULL_SYNC_COOLDOWN_MINUTES",
    24 * 60,
    0,
    7 * 24 * 60,
  );
}

function getDefaultMatchCount() {
  return getRiotMatchFetchLimit();
}

function isCooldownActive(lastSyncedAt: Date | null | undefined, cooldownMinutes: number) {
  if (!lastSyncedAt) return false;
  if (cooldownMinutes <= 0) return false;
  return Date.now() - new Date(lastSyncedAt).getTime() < cooldownMinutes * 60 * 1000;
}

function getCooldownRemainSeconds(lastSyncedAt: Date, cooldownMinutes: number) {
  const nextAvailableTime = new Date(lastSyncedAt).getTime() + cooldownMinutes * 60 * 1000;
  return Math.max(0, Math.ceil((nextAvailableTime - Date.now()) / 1000));
}

function getPrimaryRuneId(participant: RiotMatchParticipantDto) {
  return participant.perks?.styles?.[0]?.selections?.[0]?.perk ?? null;
}

function getSubRuneId(participant: RiotMatchParticipantDto) {
  return participant.perks?.styles?.[1]?.style ?? null;
}

function formatRiotId(account: NonNullable<PlayerForRiotSync["riotAccount"]>) {
  return `${account.gameName}#${account.tagLine}`;
}

async function collectRankedMatchIds(puuid: string, matchCount: number) {
  const normalizedCount = Math.min(Math.max(Math.floor(matchCount), 0), 200);
  if (normalizedCount <= 0) return [];

  const ids: string[] = [];
  let start = 0;

  while (ids.length < normalizedCount) {
    const batchSize = Math.min(RIOT_MATCH_FETCH_BATCH_SIZE, normalizedCount - ids.length);
    const batch = await getRankedMatchIdsByPuuid(puuid, batchSize, start);

    if (batch.length === 0) break;

    ids.push(...batch);

    if (batch.length < batchSize) break;
    start += batchSize;
  }

  return Array.from(new Set(ids)).slice(0, normalizedCount);
}

async function saveSoloRankSnapshot(playerId: number, soloRankEntry: RiotLeagueEntryDto | null) {
  const data = soloRankEntry
    ? {
        queueType: soloRankEntry.queueType,
        tier: soloRankEntry.tier,
        rank: soloRankEntry.rank,
        leaguePoints: soloRankEntry.leaguePoints,
        wins: soloRankEntry.wins,
        losses: soloRankEntry.losses,
        winRate: calculateWinRate(soloRankEntry.wins, soloRankEntry.losses),
      }
    : {
        queueType: "RANKED_SOLO_5x5",
        tier: null,
        rank: null,
        leaguePoints: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
      };

  await prisma.playerSoloRankSnapshot.upsert({
    where: { playerId },
    update: data,
    create: { playerId, ...data },
  });

  return data;
}

async function saveSoloMatch(playerId: number, matchId: string, match: RiotMatchDto, participant: RiotMatchParticipantDto) {
  const data = {
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
  };

  await prisma.playerSoloMatch.upsert({
    where: { playerId_matchId: { playerId, matchId } },
    update: data,
    create: { playerId, matchId, ...data },
  });
}

async function findPlayerForRiotSync(playerId: number): Promise<PlayerForRiotSync | null> {
  return prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      name: true,
      nickname: true,
      tag: true,
      riotAccount: {
        select: {
          id: true,
          playerId: true,
          gameName: true,
          tagLine: true,
          puuid: true,
          summonerId: true,
          accountId: true,
          profileIconId: true,
          summonerLevel: true,
          isVerified: true,
          lastSyncedAt: true,
        },
      },
    },
  });
}

export async function syncPlayerSoloRankBestEffort(
  playerId: number,
  options: SyncOptions = {},
): Promise<SoloSyncResult> {
  const source = options.source ?? "RIOT_SOLO_SYNC";
  const cooldownMinutes = options.cooldownMinutes ?? getUserRiotSyncCooldownMinutes();
  const matchCount = options.matchCount ?? getDefaultMatchCount();
  const includeMatches = options.includeMatches ?? true;
  const force = options.force === true;
  const now = new Date();
  const job = options.createJob
    ? await createRiotSyncJob({
        type: options.jobType ?? source,
        status: "RUNNING",
        requestedByUserAccountId: options.actorUserAccountId,
        totalCount: 1,
      })
    : null;

  try {
    const player = await findPlayerForRiotSync(playerId);

    if (!player) {
      const result = {
        playerId,
        status: "failed" as const,
        reason: "PLAYER_NOT_FOUND",
        message: "플레이어를 찾을 수 없습니다.",
      };
      await updateRiotSyncJob(job?.id, {
        status: "FAILED",
        failedCount: 1,
        totalCount: 1,
        message: result.message,
        finished: true,
      });
      return result;
    }

    if (!player.riotAccount) {
      const result = {
        playerId,
        status: "skipped" as const,
        reason: "RIOT_ACCOUNT_NOT_LINKED",
        message: "Riot 계정이 연결되어 있지 않습니다.",
      };
      await updateRiotSyncJob(job?.id, {
        status: "SKIPPED",
        successCount: 0,
        failedCount: 0,
        totalCount: 1,
        message: result.message,
        finished: true,
      });
      return result;
    }

    if (!force && isCooldownActive(player.riotAccount.lastSyncedAt, cooldownMinutes)) {
      const remainSeconds = getCooldownRemainSeconds(player.riotAccount.lastSyncedAt!, cooldownMinutes);
      const result = {
        playerId,
        status: "skipped" as const,
        reason: "COOLDOWN",
        remainSeconds,
        message: `최근 갱신 후 ${cooldownMinutes}분이 지나야 다시 갱신할 수 있습니다.`,
      };
      await markRiotAccountSyncState({
        playerId,
        syncStatus: "SKIPPED",
        lastErrorMessage: result.message,
        lastErrorAt: now,
      });
      await updateRiotSyncJob(job?.id, {
        status: "SKIPPED",
        successCount: 0,
        failedCount: 0,
        totalCount: 1,
        message: result.message,
        finished: true,
      });
      return result;
    }

    await markRiotAccountSyncState({
      playerId,
      syncStatus: "SYNCING",
      lastErrorMessage: null,
    });

    const account = player.riotAccount;
    const summoner = await getSummonerByPuuid(account.puuid);
    const soloRankEntry = await getSoloRankEntryByPuuid(account.puuid);
    const soloRank = await saveSoloRankSnapshot(player.id, soloRankEntry);

    let savedMatchCount = 0;
    let skippedMatchCount = 0;
    let requestedMatchCount = 0;

    if (includeMatches) {
      const matchIds = await collectRankedMatchIds(account.puuid, matchCount);
      requestedMatchCount = matchIds.length;

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

        await saveSoloMatch(player.id, matchId, match, participant);
        savedMatchCount += 1;
      }
    }

    await prisma.playerRiotAccount.update({
      where: { playerId: player.id },
      data: {
        summonerId: summoner.id ?? summoner.summonerId ?? summoner.encryptedSummonerId ?? account.summonerId,
        accountId: summoner.accountId ?? account.accountId,
        profileIconId: summoner.profileIconId ?? account.profileIconId,
        summonerLevel: summoner.summonerLevel ?? account.summonerLevel,
        syncStatus: "SUCCESS",
        lastErrorMessage: null,
        lastErrorAt: null,
        lastSyncedAt: new Date(),
      },
    });

    await recordRiotApiStatus({ scope: source, ok: true });

    const result = {
      playerId: player.id,
      status: "synced" as const,
      message: `${player.name}(${formatRiotId(account)}) 솔랭 데이터 동기화가 완료되었습니다.`,
      requestedMatchCount,
      savedMatchCount,
      skippedMatchCount,
      soloRank,
    };

    await updateRiotSyncJob(job?.id, {
      status: "SUCCESS",
      successCount: 1,
      failedCount: 0,
      totalCount: 1,
      message: result.message,
      finished: true,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";

    await markRiotAccountSyncState({
      playerId,
      syncStatus: "FAILED",
      lastErrorMessage: message,
      lastErrorAt: new Date(),
    });
    await recordRiotApiStatus(getRiotStatusFromError(source, error));
    await updateRiotSyncJob(job?.id, {
      status: "FAILED",
      successCount: 0,
      failedCount: 1,
      totalCount: 1,
      message,
      finished: true,
    });

    return {
      playerId,
      status: "failed",
      reason: message,
      message,
    };
  }
}
