import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

type SqlFragment = ReturnType<typeof Prisma.sql>;

type CountRow = { count: number | bigint | string | null };
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type RiotRankView = {
  tier: string | null;
  rank: string | null;
  leaguePoints: number;
  wins: number;
  losses: number;
  winRate: number;
  updatedAt: Date | null;
};

type RawRiotAccountRow = {
  id: unknown;
  playerId: unknown;
  gameName: unknown;
  tagLine: unknown;
  puuid: unknown;
  summonerId: string | null;
  accountId: string | null;
  profileIconId: unknown;
  summonerLevel: unknown;
  isVerified: unknown;
  verificationMethod: unknown;
  verifiedByUserAccountId: unknown;
  verifiedAt: Date | null;
  linkedByUserAccountId: unknown;
  linkedAt: Date | null;
  unlinkedAt: Date | null;
  syncStatus: unknown;
  lastErrorMessage: string | null;
  lastErrorAt: Date | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  playerName: unknown;
  playerNickname: unknown;
  playerTag: unknown;
  playerCurrentTier: string | null;
  playerPeakTier: string | null;
  playerIsActive: unknown;
  rankTier: string | null;
  rankRank: string | null;
  rankLeaguePoints: unknown;
  rankWins: unknown;
  rankLosses: unknown;
  rankWinRate: unknown;
  rankUpdatedAt: Date | null;
};

type RawRiotSyncJobRow = {
  id: unknown;
  type: unknown;
  status: unknown;
  requestedByUserAccountId: unknown;
  totalCount: unknown;
  successCount: unknown;
  failedCount: unknown;
  message: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RiotAccountView = {
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
  verificationMethod: string;
  verifiedByUserAccountId: number | null;
  verifiedAt: Date | null;
  linkedByUserAccountId: number | null;
  linkedAt: Date | null;
  unlinkedAt: Date | null;
  syncStatus: string;
  lastErrorMessage: string | null;
  lastErrorAt: Date | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  player: {
    id: number;
    name: string;
    nickname: string;
    tag: string;
    currentTier?: string | null;
    peakTier?: string | null;
    isActive?: boolean;
    soloRankSnapshot: RiotRankView | null;
  };
};

export type RiotApiLogView = {
  id: number;
  endpoint: string;
  method: string;
  statusCode: number | null;
  target: string | null;
  source: string;
  userAccountId: number | null;
  playerId: number | null;
  durationMs: number | null;
  errorCode: string | null;
  message: string | null;
  createdAt: Date;
};

export type RiotLinkLogView = {
  id: number;
  playerId: number | null;
  userAccountId: number | null;
  action: string;
  actorType: string;
  gameName: string | null;
  tagLine: string | null;
  puuid: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  message: string | null;
  createdAt: Date;
};

export type RiotSyncJobView = {
  id: number;
  type: string;
  status: string;
  requestedByUserAccountId: number | null;
  totalCount: number;
  successCount: number;
  failedCount: number;
  message: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toNumber(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "true" || value === "1";
  return false;
}

async function countBySql(sql: SqlFragment): Promise<number> {
  const rows = await prisma.$queryRaw<CountRow[]>(sql);
  return toNumber(rows[0]?.count);
}

export function getDateDaysAgo(days: number): Date {
  return new Date(Date.now() - days * MS_PER_DAY);
}

export function isOlderThanDays(value: Date | string | null | undefined, days: number): boolean {
  if (!value) return true;
  return new Date(value).getTime() < getDateDaysAgo(days).getTime();
}

function whereClause(conditions: SqlFragment[]): SqlFragment {
  if (conditions.length === 0) return Prisma.empty;
  let merged = conditions[0];
  for (const condition of conditions.slice(1)) {
    merged = Prisma.sql`${merged} AND ${condition}`;
  }
  return Prisma.sql`WHERE ${merged}`;
}

function accountWhere(params: { q?: string; status?: string; verified?: string }): SqlFragment {
  const conditions: SqlFragment[] = [];
  const q = params.q?.trim();
  if (q) {
    const like = `%${q}%`;
    conditions.push(Prisma.sql`(
      a."gameName" ILIKE ${like}
      OR a."tagLine" ILIKE ${like}
      OR p."name" ILIKE ${like}
      OR p."nickname" ILIKE ${like}
      OR p."tag" ILIKE ${like}
    )`);
  }
  if (params.status?.trim()) conditions.push(Prisma.sql`a."syncStatus" = ${params.status.trim()}`);
  if (params.verified === "Y") conditions.push(Prisma.sql`a."isVerified" = true`);
  if (params.verified === "N") conditions.push(Prisma.sql`a."isVerified" = false`);
  return whereClause(conditions);
}

function apiLogWhere(params: { q?: string; source?: string; onlyFail?: boolean; from: Date }): SqlFragment {
  const conditions: SqlFragment[] = [Prisma.sql`"createdAt" >= ${params.from}`];
  const q = params.q?.trim();
  if (q) {
    const like = `%${q}%`;
    conditions.push(Prisma.sql`(
      "endpoint" ILIKE ${like}
      OR "target" ILIKE ${like}
      OR "source" ILIKE ${like}
      OR "errorCode" ILIKE ${like}
      OR "message" ILIKE ${like}
    )`);
  }
  if (params.source?.trim()) conditions.push(Prisma.sql`"source" = ${params.source.trim()}`);
  if (params.onlyFail) conditions.push(Prisma.sql`"statusCode" >= 400`);
  return whereClause(conditions);
}

function syncJobWhere(params: { status?: string; type?: string }): SqlFragment {
  const conditions: SqlFragment[] = [];
  if (params.status?.trim()) conditions.push(Prisma.sql`"status" = ${params.status.trim()}`);
  if (params.type?.trim()) {
    const like = `%${params.type.trim()}%`;
    conditions.push(Prisma.sql`"type" ILIKE ${like}`);
  }
  return whereClause(conditions);
}

function mapAccountRow(row: RawRiotAccountRow): RiotAccountView {
  const rank: RiotRankView | null = row.rankTier
    ? {
        tier: row.rankTier,
        rank: row.rankRank,
        leaguePoints: toNumber(row.rankLeaguePoints),
        wins: toNumber(row.rankWins),
        losses: toNumber(row.rankLosses),
        winRate: toNumber(row.rankWinRate),
        updatedAt: row.rankUpdatedAt ?? null,
      }
    : null;

  return {
    id: toNumber(row.id),
    playerId: toNumber(row.playerId),
    gameName: String(row.gameName ?? ""),
    tagLine: String(row.tagLine ?? ""),
    puuid: String(row.puuid ?? ""),
    summonerId: row.summonerId ?? null,
    accountId: row.accountId ?? null,
    profileIconId: row.profileIconId == null ? null : toNumber(row.profileIconId),
    summonerLevel: row.summonerLevel == null ? null : toNumber(row.summonerLevel),
    isVerified: toBoolean(row.isVerified),
    verificationMethod: String(row.verificationMethod ?? "DIRECT_LINK"),
    verifiedByUserAccountId: row.verifiedByUserAccountId == null ? null : toNumber(row.verifiedByUserAccountId),
    verifiedAt: row.verifiedAt ?? null,
    linkedByUserAccountId: row.linkedByUserAccountId == null ? null : toNumber(row.linkedByUserAccountId),
    linkedAt: row.linkedAt ?? null,
    unlinkedAt: row.unlinkedAt ?? null,
    syncStatus: String(row.syncStatus ?? "IDLE"),
    lastErrorMessage: row.lastErrorMessage ?? null,
    lastErrorAt: row.lastErrorAt ?? null,
    lastSyncedAt: row.lastSyncedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    player: {
      id: toNumber(row.playerId),
      name: String(row.playerName ?? ""),
      nickname: String(row.playerNickname ?? ""),
      tag: String(row.playerTag ?? ""),
      currentTier: row.playerCurrentTier ?? null,
      peakTier: row.playerPeakTier ?? null,
      isActive: row.playerIsActive == null ? undefined : toBoolean(row.playerIsActive),
      soloRankSnapshot: rank,
    },
  };
}

function mapSyncJobRow(row: RawRiotSyncJobRow): RiotSyncJobView {
  return {
    id: toNumber(row.id),
    type: String(row.type ?? ""),
    status: String(row.status ?? ""),
    requestedByUserAccountId: row.requestedByUserAccountId == null ? null : toNumber(row.requestedByUserAccountId),
    totalCount: toNumber(row.totalCount),
    successCount: toNumber(row.successCount),
    failedCount: toNumber(row.failedCount),
    message: row.message ?? null,
    startedAt: row.startedAt ?? null,
    finishedAt: row.finishedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getRiotDashboardData(since24h: Date) {
  const [
    totalPlayers,
    linkedAccounts,
    verifiedAccounts,
    failedAccounts,
    rankSnapshots,
    soloMatches,
    apiLogs24h,
    failedApiLogs24h,
    recentAccountRows,
    recentJobRows,
  ] = await Promise.all([
    countBySql(Prisma.sql`SELECT COUNT(*)::int AS count FROM "Player" WHERE "isActive" = true`),
    countBySql(Prisma.sql`SELECT COUNT(*)::int AS count FROM "PlayerRiotAccount"`),
    countBySql(Prisma.sql`SELECT COUNT(*)::int AS count FROM "PlayerRiotAccount" WHERE "isVerified" = true AND "unlinkedAt" IS NULL`),
    countBySql(Prisma.sql`SELECT COUNT(*)::int AS count FROM "PlayerRiotAccount" WHERE "syncStatus" = 'FAILED'`),
    countBySql(Prisma.sql`SELECT COUNT(*)::int AS count FROM "PlayerSoloRankSnapshot"`),
    countBySql(Prisma.sql`SELECT COUNT(*)::int AS count FROM "PlayerSoloMatch"`),
    countBySql(Prisma.sql`SELECT COUNT(*)::int AS count FROM "RiotApiRequestLog" WHERE "createdAt" >= ${since24h}`),
    countBySql(Prisma.sql`SELECT COUNT(*)::int AS count FROM "RiotApiRequestLog" WHERE "createdAt" >= ${since24h} AND "statusCode" >= 400`),
    prisma.$queryRaw<RawRiotAccountRow[]>(Prisma.sql`
      SELECT
        a.*,
        p."name" AS "playerName",
        p."nickname" AS "playerNickname",
        p."tag" AS "playerTag",
        p."currentTier" AS "playerCurrentTier",
        p."peakTier" AS "playerPeakTier",
        p."isActive" AS "playerIsActive",
        r."tier" AS "rankTier",
        r."rank" AS "rankRank",
        r."leaguePoints" AS "rankLeaguePoints",
        r."wins" AS "rankWins",
        r."losses" AS "rankLosses",
        r."winRate" AS "rankWinRate",
        r."updatedAt" AS "rankUpdatedAt"
      FROM "PlayerRiotAccount" a
      JOIN "Player" p ON p."id" = a."playerId"
      LEFT JOIN "PlayerSoloRankSnapshot" r ON r."playerId" = a."playerId"
      ORDER BY a."updatedAt" DESC, a."id" DESC
      LIMIT 8
    `),
    prisma.$queryRaw<RawRiotSyncJobRow[]>(Prisma.sql`
      SELECT * FROM "RiotSyncJob"
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 6
    `),
  ]);

  return {
    totalPlayers,
    linkedAccounts,
    verifiedAccounts,
    failedAccounts,
    rankSnapshots,
    soloMatches,
    apiLogs24h,
    failedApiLogs24h,
    recentAccounts: recentAccountRows.map(mapAccountRow),
    recentJobs: recentJobRows.map(mapSyncJobRow),
  };
}

export async function getRiotAccountsData(params: {
  q?: string;
  status?: string;
  verified?: string;
  page: number;
  pageSize: number;
}) {
  const where = accountWhere(params);
  const offset = (params.page - 1) * params.pageSize;

  const [accountRows, total, totalLinked, failedCount, verifiedCount] = await Promise.all([
    prisma.$queryRaw<RawRiotAccountRow[]>(Prisma.sql`
      SELECT
        a.*,
        p."name" AS "playerName",
        p."nickname" AS "playerNickname",
        p."tag" AS "playerTag",
        p."currentTier" AS "playerCurrentTier",
        p."peakTier" AS "playerPeakTier",
        p."isActive" AS "playerIsActive",
        r."tier" AS "rankTier",
        r."rank" AS "rankRank",
        r."leaguePoints" AS "rankLeaguePoints",
        r."wins" AS "rankWins",
        r."losses" AS "rankLosses",
        r."winRate" AS "rankWinRate",
        r."updatedAt" AS "rankUpdatedAt"
      FROM "PlayerRiotAccount" a
      JOIN "Player" p ON p."id" = a."playerId"
      LEFT JOIN "PlayerSoloRankSnapshot" r ON r."playerId" = a."playerId"
      ${where}
      ORDER BY a."updatedAt" DESC, a."id" DESC
      OFFSET ${offset}
      LIMIT ${params.pageSize}
    `),
    countBySql(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM "PlayerRiotAccount" a
      JOIN "Player" p ON p."id" = a."playerId"
      ${where}
    `),
    countBySql(Prisma.sql`SELECT COUNT(*)::int AS count FROM "PlayerRiotAccount"`),
    countBySql(Prisma.sql`SELECT COUNT(*)::int AS count FROM "PlayerRiotAccount" WHERE "syncStatus" = 'FAILED'`),
    countBySql(Prisma.sql`SELECT COUNT(*)::int AS count FROM "PlayerRiotAccount" WHERE "isVerified" = true AND "unlinkedAt" IS NULL`),
  ]);

  return {
    accounts: accountRows.map(mapAccountRow),
    total,
    totalLinked,
    failedCount,
    verifiedCount,
  };
}

export async function getRiotLogsData(params: {
  q?: string;
  source?: string;
  onlyFail: boolean;
  from: Date;
  page: number;
  pageSize: number;
}) {
  const where = apiLogWhere(params);
  const offset = (params.page - 1) * params.pageSize;

  const [logs, total, failTotal, linkLogs] = await Promise.all([
    prisma.$queryRaw<RiotApiLogView[]>(Prisma.sql`
      SELECT * FROM "RiotApiRequestLog"
      ${where}
      ORDER BY "createdAt" DESC, "id" DESC
      OFFSET ${offset}
      LIMIT ${params.pageSize}
    `),
    countBySql(Prisma.sql`SELECT COUNT(*)::int AS count FROM "RiotApiRequestLog" ${where}`),
    countBySql(Prisma.sql`SELECT COUNT(*)::int AS count FROM "RiotApiRequestLog" WHERE "createdAt" >= ${params.from} AND "statusCode" >= 400`),
    prisma.$queryRaw<RiotLinkLogView[]>(Prisma.sql`
      SELECT * FROM "RiotAccountLinkLog"
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 20
    `),
  ]);

  return { logs, total, failTotal, linkLogs };
}

export async function getRiotSyncData(params: {
  status?: string;
  type?: string;
  page: number;
  pageSize: number;
}) {
  const where = syncJobWhere(params);
  const offset = (params.page - 1) * params.pageSize;

  const [jobRows, total, runningCount, failedCount, recentAccountRows] = await Promise.all([
    prisma.$queryRaw<RawRiotSyncJobRow[]>(Prisma.sql`
      SELECT * FROM "RiotSyncJob"
      ${where}
      ORDER BY "createdAt" DESC, "id" DESC
      OFFSET ${offset}
      LIMIT ${params.pageSize}
    `),
    countBySql(Prisma.sql`SELECT COUNT(*)::int AS count FROM "RiotSyncJob" ${where}`),
    countBySql(Prisma.sql`SELECT COUNT(*)::int AS count FROM "RiotSyncJob" WHERE "status" = 'RUNNING'`),
    countBySql(Prisma.sql`SELECT COUNT(*)::int AS count FROM "RiotSyncJob" WHERE "status" = 'FAILED'`),
    prisma.$queryRaw<RawRiotAccountRow[]>(Prisma.sql`
      SELECT
        a.*,
        p."name" AS "playerName",
        p."nickname" AS "playerNickname",
        p."tag" AS "playerTag",
        p."currentTier" AS "playerCurrentTier",
        p."peakTier" AS "playerPeakTier",
        p."isActive" AS "playerIsActive",
        r."tier" AS "rankTier",
        r."rank" AS "rankRank",
        r."leaguePoints" AS "rankLeaguePoints",
        r."wins" AS "rankWins",
        r."losses" AS "rankLosses",
        r."winRate" AS "rankWinRate",
        r."updatedAt" AS "rankUpdatedAt"
      FROM "PlayerRiotAccount" a
      JOIN "Player" p ON p."id" = a."playerId"
      LEFT JOIN "PlayerSoloRankSnapshot" r ON r."playerId" = a."playerId"
      ORDER BY a."lastSyncedAt" ASC NULLS FIRST, a."updatedAt" ASC, a."id" ASC
      LIMIT 12
    `),
  ]);

  return {
    jobs: jobRows.map(mapSyncJobRow),
    total,
    runningCount,
    failedCount,
    recentAccounts: recentAccountRows.map(mapAccountRow),
  };
}
