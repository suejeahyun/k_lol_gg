import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { createRiotSyncJob, updateRiotSyncJob } from "@/lib/riot/audit";
import {
  getAdminFullRiotSyncCooldownMinutes,
  syncPlayerSoloRankBestEffort,
  type SoloSyncResult,
} from "@/lib/riot/solo-sync";

export type RiotBulkSyncMode = "ALL" | "STALE" | "FAILED";

export type RiotBulkSyncOptions = {
  mode: RiotBulkSyncMode;
  actorUserAccountId?: number | null;
  batchSize?: number;
  matchCount?: number;
  rankOnly?: boolean;
  force?: boolean;
  staleHours?: number;
};

export type RiotBulkSyncResult = {
  mode: RiotBulkSyncMode;
  totalCandidates: number;
  processedCount: number;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  remainingCount: number;
  message: string;
  results: Array<
    SoloSyncResult & {
      playerName: string;
      playerNickname: string;
      playerTag: string;
    }
  >;
};

type RiotAccountCandidate = {
  playerId: number;
  syncStatus: string;
  lastSyncedAt: Date | null;
  lastErrorAt: Date | null;
  player: {
    name: string;
    nickname: string;
    tag: string;
  };
};

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_STALE_HOURS = 24;

function normalizeInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizeMode(value: unknown): RiotBulkSyncMode {
  if (value === "ALL" || value === "FAILED" || value === "STALE") return value;
  return "STALE";
}

function getModeLabel(mode: RiotBulkSyncMode) {
  if (mode === "ALL") return "전체 계정";
  if (mode === "FAILED") return "실패 계정";
  return "갱신 필요 계정";
}

function getJobType(mode: RiotBulkSyncMode) {
  if (mode === "ALL") return "ADMIN_BULK_ALL_PLAYERS";
  if (mode === "FAILED") return "ADMIN_RETRY_FAILED_PLAYERS";
  return "ADMIN_BULK_STALE_PLAYERS";
}

function getSource(mode: RiotBulkSyncMode) {
  if (mode === "ALL") return "ADMIN_BULK_ALL_SOLO_SYNC";
  if (mode === "FAILED") return "ADMIN_FAILED_RETRY_SOLO_SYNC";
  return "ADMIN_BULK_STALE_SOLO_SYNC";
}

function getAccountWhere(mode: RiotBulkSyncMode, staleHours: number): Prisma.PlayerRiotAccountWhereInput {
  const base: Prisma.PlayerRiotAccountWhereInput = {
    unlinkedAt: null,
  };

  if (mode === "FAILED") {
    return {
      ...base,
      OR: [
        { syncStatus: "FAILED" },
        { lastErrorAt: { not: null } },
      ],
    };
  }

  if (mode === "STALE") {
    const staleBefore = new Date(Date.now() - staleHours * 60 * 60 * 1000);
    return {
      ...base,
      OR: [
        { lastSyncedAt: null },
        { lastSyncedAt: { lt: staleBefore } },
        { syncStatus: "FAILED" },
      ],
    };
  }

  return base;
}

export function parseRiotBulkSyncBody(body: unknown) {
  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  return {
    mode: normalizeMode(payload.mode),
    batchSize: normalizeInteger(payload.batchSize, DEFAULT_BATCH_SIZE, 1, 30),
    matchCount: normalizeInteger(payload.matchCount, 20, 0, 200),
    rankOnly: payload.rankOnly === true,
    force: payload.force === true,
    staleHours: normalizeInteger(payload.staleHours, DEFAULT_STALE_HOURS, 1, 24 * 14),
  };
}

export async function runRiotBulkSoloSync(options: RiotBulkSyncOptions): Promise<RiotBulkSyncResult> {
  const mode = normalizeMode(options.mode);
  const batchSize = normalizeInteger(options.batchSize, DEFAULT_BATCH_SIZE, 1, 30);
  const matchCount = normalizeInteger(options.matchCount, 20, 0, 200);
  const staleHours = normalizeInteger(options.staleHours, DEFAULT_STALE_HOURS, 1, 24 * 14);
  const where = getAccountWhere(mode, staleHours);
  const jobType = getJobType(mode);
  const source = getSource(mode);

  const [totalCandidates, accounts] = await Promise.all([
    prisma.playerRiotAccount.count({ where }),
    prisma.playerRiotAccount.findMany({
      where,
      select: {
        playerId: true,
        syncStatus: true,
        lastSyncedAt: true,
        lastErrorAt: true,
        player: {
          select: {
            name: true,
            nickname: true,
            tag: true,
          },
        },
      },
      orderBy: [
        { lastSyncedAt: "asc" },
        { updatedAt: "asc" },
        { id: "asc" },
      ],
      take: batchSize,
    }),
  ]);

  const label = getModeLabel(mode);
  const job = await createRiotSyncJob({
    type: jobType,
    status: accounts.length > 0 ? "RUNNING" : "SKIPPED",
    requestedByUserAccountId: options.actorUserAccountId,
    totalCount: accounts.length,
    message: `${label} 동기화 배치 시작: 후보 ${totalCandidates}명, 처리 ${accounts.length}명`,
  });

  if (accounts.length === 0) {
    const message = `${label} 동기화 대상이 없습니다.`;
    await updateRiotSyncJob(job?.id, {
      status: "SKIPPED",
      totalCount: 0,
      successCount: 0,
      failedCount: 0,
      message,
      finished: true,
    });

    return {
      mode,
      totalCandidates,
      processedCount: 0,
      successCount: 0,
      skippedCount: 0,
      failedCount: 0,
      remainingCount: 0,
      message,
      results: [],
    };
  }

  const results: RiotBulkSyncResult["results"] = [];
  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const account of accounts as RiotAccountCandidate[]) {
    const result = await syncPlayerSoloRankBestEffort(account.playerId, {
      actorUserAccountId: options.actorUserAccountId,
      source,
      jobType: `${jobType}_ITEM`,
      createJob: false,
      cooldownMinutes: options.force ? 0 : getAdminFullRiotSyncCooldownMinutes(),
      matchCount,
      includeMatches: options.rankOnly !== true,
      force: options.force === true,
    });

    if (result.status === "synced") successCount += 1;
    else if (result.status === "skipped") skippedCount += 1;
    else failedCount += 1;

    results.push({
      ...result,
      playerName: account.player.name,
      playerNickname: account.player.nickname,
      playerTag: account.player.tag,
    });
  }

  const processedCount = results.length;
  const remainingCount = Math.max(0, totalCandidates - processedCount);
  const status = failedCount > 0
    ? successCount > 0 || skippedCount > 0
      ? "PARTIAL"
      : "FAILED"
    : successCount > 0
      ? "SUCCESS"
      : "SKIPPED";
  const message = `${label} 동기화 배치 완료: 성공 ${successCount}명, 건너뜀 ${skippedCount}명, 실패 ${failedCount}명, 남은 후보 ${remainingCount}명`;

  await updateRiotSyncJob(job?.id, {
    status,
    totalCount: processedCount,
    successCount,
    failedCount,
    message,
    finished: true,
  });

  return {
    mode,
    totalCandidates,
    processedCount,
    successCount,
    skippedCount,
    failedCount,
    remainingCount,
    message,
    results,
  };
}
