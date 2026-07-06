import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { createRiotSyncJob, recordRiotAccountLinkLog, updateRiotSyncJob } from "@/lib/riot/audit";
import { getRiotAccountByRiotId, getSummonerByPuuid } from "@/lib/riot/client";
import { syncPlayerSoloRankBestEffort } from "@/lib/riot/solo-sync";

export type RiotBulkLinkOptions = {
  actorUserAccountId?: number | null;
  q?: string | null;
  batchSize?: number;
  syncAfterLink?: boolean;
  rankOnly?: boolean;
  matchCount?: number;
};

export type RiotBulkLinkPreview = {
  totalActivePlayers: number;
  linkedAccounts: number;
  totalCandidates: number;
  batchSize: number;
  q: string;
  candidates: RiotBulkLinkCandidate[];
};

export type RiotBulkLinkCandidate = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  riotId: string;
  createdAt: Date;
};

export type RiotBulkLinkItemResult = {
  playerId: number;
  playerName: string;
  playerNickname: string;
  playerTag: string;
  riotId: string;
  status: "linked" | "failed" | "skipped";
  message: string;
  syncStatus?: string;
  syncMessage?: string;
};

export type RiotBulkLinkResult = {
  totalCandidates: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  remainingCount: number;
  message: string;
  results: RiotBulkLinkItemResult[];
};

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MATCH_COUNT = 0;

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizeTagLine(value: string) {
  return cleanText(value).replace(/^#/, "");
}

function getCandidateRiotId(player: { nickname: string; tag: string }) {
  const gameName = cleanText(player.nickname);
  const tagLine = normalizeTagLine(player.tag);
  return `${gameName}#${tagLine}`;
}

function isInvalidCandidateRiotId(player: { nickname: string; tag: string }) {
  const gameName = cleanText(player.nickname);
  const tagLine = normalizeTagLine(player.tag);
  const loweredTag = tagLine.toLowerCase();

  if (!gameName || !tagLine) return "닉네임 또는 태그가 비어 있습니다.";
  if (gameName.length > 64 || tagLine.length > 16) return "Riot ID 길이 제한을 초과했습니다.";
  if (["fail", "none", "null", "undefined", "-"].includes(loweredTag)) return "태그 값이 Riot ID로 사용하기 어렵습니다.";

  return null;
}

function getPlayerWhere(q: string): Prisma.PlayerWhereInput {
  const where: Prisma.PlayerWhereInput = {
    isActive: true,
    riotAccount: { is: null },
  };

  if (!q) return where;

  return {
    ...where,
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { nickname: { contains: q, mode: "insensitive" } },
      { tag: { contains: q, mode: "insensitive" } },
    ],
  };
}

export function parseRiotBulkLinkBody(body: unknown) {
  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  return {
    q: cleanText(payload.q),
    batchSize: normalizeInteger(payload.batchSize, DEFAULT_BATCH_SIZE, 1, 30),
    syncAfterLink: payload.syncAfterLink === true,
    rankOnly: payload.rankOnly !== false,
    matchCount: normalizeInteger(payload.matchCount, DEFAULT_MATCH_COUNT, 0, 50),
  } satisfies RiotBulkLinkOptions;
}

export async function getRiotBulkLinkPreview(options: Pick<RiotBulkLinkOptions, "q" | "batchSize"> = {}): Promise<RiotBulkLinkPreview> {
  const q = cleanText(options.q ?? "");
  const batchSize = normalizeInteger(options.batchSize, DEFAULT_BATCH_SIZE, 1, 30);
  const where = getPlayerWhere(q);

  const [totalActivePlayers, linkedAccounts, totalCandidates, players] = await Promise.all([
    prisma.player.count({ where: { isActive: true } }),
    prisma.playerRiotAccount.count({ where: { unlinkedAt: null } }),
    prisma.player.count({ where }),
    prisma.player.findMany({
      where,
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
        createdAt: true,
      },
      orderBy: [{ id: "asc" }],
      take: batchSize,
    }),
  ]);

  return {
    totalActivePlayers,
    linkedAccounts,
    totalCandidates,
    batchSize,
    q,
    candidates: players.map((player) => ({
      playerId: player.id,
      name: player.name,
      nickname: player.nickname,
      tag: player.tag,
      riotId: getCandidateRiotId(player),
      createdAt: player.createdAt,
    })),
  };
}

async function findDuplicatePuuid(puuid: string, playerId: number) {
  return prisma.playerRiotAccount.findFirst({
    where: {
      puuid,
      NOT: { playerId },
    },
    select: {
      playerId: true,
      player: {
        select: {
          name: true,
          nickname: true,
          tag: true,
        },
      },
    },
  });
}

export async function runRiotBulkAccountLink(options: RiotBulkLinkOptions): Promise<RiotBulkLinkResult> {
  const q = cleanText(options.q ?? "");
  const batchSize = normalizeInteger(options.batchSize, DEFAULT_BATCH_SIZE, 1, 30);
  const matchCount = normalizeInteger(options.matchCount, DEFAULT_MATCH_COUNT, 0, 50);
  const syncAfterLink = options.syncAfterLink === true;
  const rankOnly = options.rankOnly !== false;
  const preview = await getRiotBulkLinkPreview({ q, batchSize });
  const candidates = preview.candidates;

  const job = await createRiotSyncJob({
    type: "ADMIN_BULK_RIOT_ACCOUNT_LINK",
    status: candidates.length > 0 ? "RUNNING" : "SKIPPED",
    requestedByUserAccountId: options.actorUserAccountId,
    totalCount: candidates.length,
    message: `Riot 계정 일괄 연결 시작: 후보 ${preview.totalCandidates}명, 처리 ${candidates.length}명`,
  });

  if (candidates.length === 0) {
    const message = "Riot 계정 일괄 연결 대상이 없습니다.";
    await updateRiotSyncJob(job?.id, {
      status: "SKIPPED",
      totalCount: 0,
      successCount: 0,
      failedCount: 0,
      message,
      finished: true,
    });

    return {
      totalCandidates: preview.totalCandidates,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      remainingCount: 0,
      message,
      results: [],
    };
  }

  const results: RiotBulkLinkItemResult[] = [];
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const player of candidates) {
    const invalidMessage = isInvalidCandidateRiotId(player);
    const gameName = cleanText(player.nickname);
    const tagLine = normalizeTagLine(player.tag);
    const riotId = getCandidateRiotId(player);

    if (invalidMessage) {
      skippedCount += 1;
      results.push({
        playerId: player.playerId,
        playerName: player.name,
        playerNickname: player.nickname,
        playerTag: player.tag,
        riotId,
        status: "skipped",
        message: invalidMessage,
      });
      await recordRiotAccountLinkLog({
        playerId: player.playerId,
        userAccountId: options.actorUserAccountId,
        action: "ADMIN_BULK_LINK_SKIPPED_INVALID_RIOT_ID",
        actorType: "ADMIN",
        gameName,
        tagLine,
        message: invalidMessage,
      });
      continue;
    }

    try {
      const account = await getRiotAccountByRiotId(gameName, tagLine);
      const duplicate = await findDuplicatePuuid(account.puuid, player.playerId);

      if (duplicate) {
        const message = `이미 다른 플레이어(${duplicate.player.name} / ${duplicate.player.nickname}#${duplicate.player.tag})에 연결된 Riot 계정입니다.`;
        failedCount += 1;
        results.push({
          playerId: player.playerId,
          playerName: player.name,
          playerNickname: player.nickname,
          playerTag: player.tag,
          riotId,
          status: "failed",
          message,
        });
        await recordRiotAccountLinkLog({
          playerId: player.playerId,
          userAccountId: options.actorUserAccountId,
          action: "ADMIN_BULK_LINK_BLOCKED_DUPLICATE",
          actorType: "ADMIN",
          gameName: account.gameName,
          tagLine: account.tagLine,
          puuid: account.puuid,
          message,
        });
        continue;
      }

      const summoner = await getSummonerByPuuid(account.puuid);
      const now = new Date();

      await prisma.playerRiotAccount.upsert({
        where: { playerId: player.playerId },
        update: {
          gameName: account.gameName,
          tagLine: account.tagLine,
          puuid: account.puuid,
          summonerId: summoner.id ?? summoner.summonerId ?? summoner.encryptedSummonerId ?? null,
          accountId: summoner.accountId ?? null,
          profileIconId: summoner.profileIconId ?? null,
          summonerLevel: summoner.summonerLevel ?? null,
          isVerified: false,
          verificationMethod: "ADMIN_BULK_LINK",
          verifiedByUserAccountId: null,
          verifiedAt: null,
          rsoSubject: null,
          linkedByUserAccountId: options.actorUserAccountId ?? null,
          linkedAt: now,
          unlinkedAt: null,
          syncStatus: "IDLE",
          lastErrorMessage: null,
          lastErrorAt: null,
        },
        create: {
          playerId: player.playerId,
          gameName: account.gameName,
          tagLine: account.tagLine,
          puuid: account.puuid,
          summonerId: summoner.id ?? summoner.summonerId ?? summoner.encryptedSummonerId ?? null,
          accountId: summoner.accountId ?? null,
          profileIconId: summoner.profileIconId ?? null,
          summonerLevel: summoner.summonerLevel ?? null,
          isVerified: false,
          verificationMethod: "ADMIN_BULK_LINK",
          verifiedByUserAccountId: null,
          verifiedAt: null,
          rsoSubject: null,
          linkedByUserAccountId: options.actorUserAccountId ?? null,
          linkedAt: now,
          syncStatus: "IDLE",
        },
      });

      await recordRiotAccountLinkLog({
        playerId: player.playerId,
        userAccountId: options.actorUserAccountId,
        action: "ADMIN_BULK_LINK",
        actorType: "ADMIN",
        gameName: account.gameName,
        tagLine: account.tagLine,
        puuid: account.puuid,
        message: `${player.name}(${player.nickname}#${player.tag}) Riot 계정 일괄 연결`,
      });

      let syncStatus: string | undefined;
      let syncMessage: string | undefined;

      if (syncAfterLink) {
        const syncResult = await syncPlayerSoloRankBestEffort(player.playerId, {
          actorUserAccountId: options.actorUserAccountId,
          source: "ADMIN_BULK_LINK_SOLO_SYNC",
          jobType: "ADMIN_BULK_LINK_SOLO_SYNC_ITEM",
          createJob: false,
          cooldownMinutes: 0,
          matchCount,
          includeMatches: !rankOnly,
          force: true,
        });
        syncStatus = syncResult.status;
        syncMessage = syncResult.message;
      }

      successCount += 1;
      results.push({
        playerId: player.playerId,
        playerName: player.name,
        playerNickname: player.nickname,
        playerTag: player.tag,
        riotId: `${account.gameName}#${account.tagLine}`,
        status: "linked",
        message: "Riot 계정 연결 완료 · 본인 소유 인증은 유저 Riot 로그인 필요",
        syncStatus,
        syncMessage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Riot 계정 연결 중 알 수 없는 오류가 발생했습니다.";
      failedCount += 1;
      results.push({
        playerId: player.playerId,
        playerName: player.name,
        playerNickname: player.nickname,
        playerTag: player.tag,
        riotId,
        status: "failed",
        message,
      });
      await recordRiotAccountLinkLog({
        playerId: player.playerId,
        userAccountId: options.actorUserAccountId,
        action: "ADMIN_BULK_LINK_FAILED",
        actorType: "ADMIN",
        gameName,
        tagLine,
        message,
      });
    }
  }

  const processedCount = results.length;
  const remainingCount = Math.max(0, preview.totalCandidates - processedCount);
  const status = failedCount > 0
    ? successCount > 0 || skippedCount > 0
      ? "PARTIAL"
      : "FAILED"
    : successCount > 0
      ? "SUCCESS"
      : "SKIPPED";
  const message = `Riot 계정 일괄 연결 완료: 성공 ${successCount}명, 건너뜀 ${skippedCount}명, 실패 ${failedCount}명, 남은 후보 ${remainingCount}명`;

  await updateRiotSyncJob(job?.id, {
    status,
    totalCount: processedCount,
    successCount,
    failedCount,
    message,
    finished: true,
  });

  return {
    totalCandidates: preview.totalCandidates,
    processedCount,
    successCount,
    failedCount,
    skippedCount,
    remainingCount,
    message,
    results,
  };
}
