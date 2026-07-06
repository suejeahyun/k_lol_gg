import { prisma } from "@/lib/prisma/client";

type NullableNumber = number | null | undefined;
type NullableString = string | null | undefined;

const MAX_LOG_TEXT_LENGTH = 1_000;

function cleanText(value: NullableString) {
  if (value == null) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  return text.length > MAX_LOG_TEXT_LENGTH ? `${text.slice(0, MAX_LOG_TEXT_LENGTH)}…` : text;
}

function cleanNumber(value: NullableNumber) {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

export function maskRiotIdentifier(value: NullableString) {
  const text = cleanText(value);
  if (!text) return undefined;
  if (text.length <= 8) return "****";
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

export async function recordRiotAccountLinkLog(input: {
  playerId?: NullableNumber;
  userAccountId?: NullableNumber;
  action: string;
  actorType?: NullableString;
  gameName?: NullableString;
  tagLine?: NullableString;
  puuid?: NullableString;
  ipAddress?: NullableString;
  userAgent?: NullableString;
  message?: NullableString;
}) {
  try {
    await prisma.riotAccountLinkLog.create({
      data: {
        playerId: cleanNumber(input.playerId),
        userAccountId: cleanNumber(input.userAccountId),
        action: cleanText(input.action) ?? "UNKNOWN",
        actorType: cleanText(input.actorType) ?? "SYSTEM",
        gameName: cleanText(input.gameName),
        tagLine: cleanText(input.tagLine),
        puuid: maskRiotIdentifier(input.puuid),
        ipAddress: cleanText(input.ipAddress),
        userAgent: cleanText(input.userAgent),
        message: cleanText(input.message),
      },
    });
  } catch (error) {
    console.error("[RIOT_ACCOUNT_LINK_LOG_ERROR]", error);
  }
}

export async function recordRiotApiRequestLog(input: {
  endpoint: string;
  method?: NullableString;
  statusCode?: NullableNumber;
  target?: NullableString;
  source?: NullableString;
  userAccountId?: NullableNumber;
  playerId?: NullableNumber;
  durationMs?: NullableNumber;
  errorCode?: NullableString;
  message?: NullableString;
}) {
  try {
    await prisma.riotApiRequestLog.create({
      data: {
        endpoint: cleanText(input.endpoint) ?? "UNKNOWN_ENDPOINT",
        method: cleanText(input.method) ?? "GET",
        statusCode: cleanNumber(input.statusCode),
        target: maskRiotIdentifier(input.target),
        source: cleanText(input.source) ?? "RIOT_CLIENT",
        userAccountId: cleanNumber(input.userAccountId),
        playerId: cleanNumber(input.playerId),
        durationMs: cleanNumber(input.durationMs),
        errorCode: cleanText(input.errorCode),
        message: cleanText(input.message),
      },
    });
  } catch (error) {
    console.error("[RIOT_API_REQUEST_LOG_ERROR]", error);
  }
}

export async function createRiotSyncJob(input: {
  type: string;
  status?: NullableString;
  requestedByUserAccountId?: NullableNumber;
  totalCount?: NullableNumber;
  message?: NullableString;
}) {
  try {
    return await prisma.riotSyncJob.create({
      data: {
        type: cleanText(input.type) ?? "UNKNOWN",
        status: cleanText(input.status) ?? "PENDING",
        requestedByUserAccountId: cleanNumber(input.requestedByUserAccountId),
        totalCount: cleanNumber(input.totalCount) ?? 0,
        message: cleanText(input.message),
        startedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[RIOT_SYNC_JOB_CREATE_ERROR]", error);
    return null;
  }
}

export async function updateRiotSyncJob(
  jobId: NullableNumber,
  input: {
    status?: NullableString;
    successCount?: NullableNumber;
    failedCount?: NullableNumber;
    totalCount?: NullableNumber;
    message?: NullableString;
    finished?: boolean;
  },
) {
  const id = cleanNumber(jobId);
  if (!id) return;

  try {
    await prisma.riotSyncJob.update({
      where: { id },
      data: {
        status: cleanText(input.status),
        successCount: cleanNumber(input.successCount),
        failedCount: cleanNumber(input.failedCount),
        totalCount: cleanNumber(input.totalCount),
        message: cleanText(input.message),
        finishedAt: input.finished ? new Date() : undefined,
      },
    });
  } catch (error) {
    console.error("[RIOT_SYNC_JOB_UPDATE_ERROR]", error);
  }
}

export async function markRiotAccountSyncState(input: {
  playerId: number;
  syncStatus: "IDLE" | "SYNCING" | "SUCCESS" | "FAILED" | "SKIPPED";
  lastErrorMessage?: NullableString;
  lastErrorAt?: Date | null;
  lastSyncedAt?: Date | null;
}) {
  try {
    await prisma.playerRiotAccount.updateMany({
      where: { playerId: input.playerId },
      data: {
        syncStatus: input.syncStatus,
        lastErrorMessage: cleanText(input.lastErrorMessage),
        lastErrorAt: input.lastErrorAt ?? undefined,
        lastSyncedAt: input.lastSyncedAt ?? undefined,
      },
    });
  } catch (error) {
    console.error("[RIOT_ACCOUNT_SYNC_STATE_ERROR]", error);
  }
}
