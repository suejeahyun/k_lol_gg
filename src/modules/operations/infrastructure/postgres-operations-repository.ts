import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { and, asc, count, desc, eq, inArray, isNull, lte, lt, or, sql } from "drizzle-orm";

import { authorizeAiRequest, updateSiteSettings, type PublicFeatureFlags, type SiteSettings } from "../domain/site-settings";
import { buildCsvBackup } from "../domain/csv-backup";
import type {
  AiCompletionPort,
  AiRequestLedgerDto,
  AiRequestResultBody,
  AuditLogDto,
  AuditStatsDto,
  OperationsActor,
  OperationsCommandMetadata,
  OperationsCommandPort,
  OperationsCommandResult,
  OperationsQueryPort,
  PublicOperationsDashboardDto,
} from "../application/ports";
import {
  ADMIN_MUTATION_SESSION_POLICY,
  APPROVED_ACCOUNT_MUTATION_SESSION_POLICY,
  lockTransactionSessionActor,
} from "@/modules/auth/infrastructure/transaction-session-guard";
import { auditEvents } from "@/platform/db/schema/audit";
import { loginRateLimitBuckets, userAccounts } from "@/platform/db/schema/auth";
import { matchRateLimitBuckets, matchSeries } from "@/platform/db/schema/matches";
import { mmrPlayerProfiles } from "@/platform/db/schema/mmr";
import {
  aiRequestLedger,
  jobNonceBindings,
  maintenanceRuns,
  operationsCommandReceipts,
  operationsOutbox,
  siteSettings,
} from "@/platform/db/schema/operations";
import { players } from "@/platform/db/schema/registry";
import { recruitParties, recruitingOutbox, scrimRecruits } from "@/platform/db/schema/recruiting";
import { playerSeasonStats } from "@/platform/db/schema/statistics";
import type { V2Database } from "@/platform/db/database";
import type { V2Transaction } from "@/platform/db/transaction";
import { withTransaction } from "@/platform/db/transaction";
import { recruitingOperatingDateKey } from "@/modules/recruiting/domain/operating-day";

const RECEIPT_TTL_MS = 24 * 60 * 60 * 1_000;
const JOB_NONCE_TTL_MS = 15 * 60 * 1_000;
const KAKAO_DAILY_CLOSE_NONCE_TTL_MS = 48 * 60 * 60 * 1_000;
const AI_FAILURE_COST_MICROS = 0;

export class OperationsError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
  }
}

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

function bufferFromHex(value: string, code: string) {
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new OperationsError(code);
  return Buffer.from(value, "hex");
}

function validFeatures(value: unknown): value is PublicFeatureFlags {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return ["registrations", "matchSubmissions", "teamBalance", "kakaoHelp", "riotIntegration", "aiAssistant"]
    .every((key) => typeof record[key] === "boolean");
}

function settingsFromRow(row: typeof siteSettings.$inferSelect): SiteSettings {
  const roles = row.aiAllowedRolesJson;
  if (!validFeatures(row.featuresJson) || !Array.isArray(roles) || roles.some((role) => !["USER", "ADMIN", "SUPER_ADMIN"].includes(role))) {
    throw new OperationsError("INVALID_STORED_SITE_SETTINGS");
  }
  return {
    revision: row.revision,
    brandName: row.brandName,
    tagline: row.tagline,
    supportUrl: row.supportUrl,
    features: {
      registrations: row.featuresJson.registrations,
      matchSubmissions: row.featuresJson.matchSubmissions,
      teamBalance: row.featuresJson.teamBalance,
      kakaoHelp: row.featuresJson.kakaoHelp,
      riotIntegration: row.featuresJson.riotIntegration,
      aiAssistant: row.featuresJson.aiAssistant,
    },
    aiAllowedRoles: roles as SiteSettings["aiAllowedRoles"],
    aiRequestsPerHour: row.aiRequestsPerHour,
    aiDailyCostLimitMicros: row.aiDailyCostLimitMicros,
    internalMaintenanceNote: row.internalMaintenanceNote,
  };
}

function requestIdentity(metadata: OperationsCommandMetadata) {
  return {
    keyHash: hash(`klol-v2:operations-key:v1\0${metadata.requestKey}`),
    requestHash: bufferFromHex(metadata.requestHashHex, "INVALID_REQUEST_HASH"),
  };
}

function sameBytes(left: Buffer | Uint8Array, right: Buffer | Uint8Array) {
  return Buffer.from(left).equals(Buffer.from(right));
}

async function requireTransactionActor(
  transaction: V2Transaction,
  actor: OperationsActor,
  minimumRole: "USER" | "SUPER_ADMIN",
) {
  const policy = minimumRole === "SUPER_ADMIN"
    ? { ...ADMIN_MUTATION_SESSION_POLICY, minimumRole: "SUPER_ADMIN" as const }
    : APPROVED_ACCOUNT_MUTATION_SESSION_POLICY;
  const locked = await lockTransactionSessionActor(transaction, actor.session, new Date(), policy);
  if (!locked || locked.id !== actor.session.userAccountId || locked.role !== actor.role) {
    throw new OperationsError("SESSION_STALE");
  }
  return locked;
}

type ReceiptResult<T extends Record<string, unknown>> = OperationsCommandResult<T> | null;

async function readReceipt<T extends Record<string, unknown>>(
  transaction: V2Transaction,
  actorId: string,
  scope: string,
  metadata: OperationsCommandMetadata,
): Promise<ReceiptResult<T>> {
  const identity = requestIdentity(metadata);
  const lockKey = `${actorId}:${scope}:${identity.keyHash.toString("hex")}`;
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
  const receipt = (await transaction.select().from(operationsCommandReceipts).where(and(
    eq(operationsCommandReceipts.actorUserAccountId, actorId),
    eq(operationsCommandReceipts.scope, scope),
    eq(operationsCommandReceipts.keyHash, identity.keyHash),
  )).limit(1))[0];
  if (!receipt || receipt.expiresAt <= new Date()) return null;
  if (!sameBytes(receipt.requestHash, identity.requestHash)) throw new OperationsError("IDEMPOTENCY_MISMATCH");
  const body = receipt.responseJson as T;
  const revision = Number(String(receipt.responseEtag ?? "").replaceAll('"', ""));
  return {
    status: receipt.responseStatus,
    body,
    revision: Number.isSafeInteger(revision) ? revision : metadata.expectedRevision,
    replayed: true,
  };
}

async function writeReceipt<T extends Record<string, unknown>>(
  transaction: V2Transaction,
  input: Readonly<{
    actorId: string;
    scope: string;
    metadata: OperationsCommandMetadata;
    status: number;
    body: T;
    revision: number;
    now: Date;
  }>,
) {
  const identity = requestIdentity(input.metadata);
  await transaction.delete(operationsCommandReceipts).where(and(
    eq(operationsCommandReceipts.actorUserAccountId, input.actorId),
    eq(operationsCommandReceipts.scope, input.scope),
    eq(operationsCommandReceipts.keyHash, identity.keyHash),
  ));
  await transaction.insert(operationsCommandReceipts).values({
    id: randomUUID(),
    actorUserAccountId: input.actorId,
    scope: input.scope,
    keyHash: identity.keyHash,
    requestHash: identity.requestHash,
    responseStatus: input.status,
    responseJson: input.body,
    responseEtag: `"${input.revision}"`,
    createdAt: input.now,
    expiresAt: new Date(input.now.getTime() + RECEIPT_TTL_MS),
  });
}

async function writeAuditAndOutbox(transaction: V2Transaction, input: Readonly<{
  actorId: string | null;
  requestId: string;
  action: string;
  targetType: string;
  targetId: string;
  revision: number;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  now: Date;
}>) {
  await transaction.insert(auditEvents).values({
    requestId: input.requestId,
    actorUserAccountId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    beforeJson: input.before ?? null,
    afterJson: input.after ?? null,
    metadataJson: input.metadata ?? {},
    createdAt: input.now,
  });
  await transaction.insert(operationsOutbox).values({
    id: randomUUID(),
    requestId: input.requestId,
    aggregateType: input.targetType,
    aggregateId: input.targetId,
    aggregateRevision: input.revision,
    eventType: input.action,
    payloadJson: { targetId: input.targetId, revision: input.revision },
    status: "PENDING",
    createdAt: input.now,
  });
}

function safeSettingsForAudit(settings: SiteSettings): Record<string, unknown> {
  return {
    revision: settings.revision,
    brandName: settings.brandName,
    tagline: settings.tagline,
    supportUrl: settings.supportUrl,
    features: settings.features,
    aiAllowedRoles: settings.aiAllowedRoles,
    aiRequestsPerHour: settings.aiRequestsPerHour,
    aiDailyCostLimitMicros: settings.aiDailyCostLimitMicros,
    hasInternalMaintenanceNote: settings.internalMaintenanceNote !== null,
  };
}

export class DisabledAiCompletionAdapter implements AiCompletionPort {
  readonly key = "disabled";

  async complete(): Promise<never> {
    throw new OperationsError("AI_ADAPTER_DISABLED");
  }
}

export class PostgresOperationsRepository implements OperationsQueryPort, OperationsCommandPort {
  constructor(
    private readonly database: V2Database,
    private readonly ai: AiCompletionPort = new DisabledAiCompletionAdapter(),
  ) {}

  async getSiteSettings() {
    const row = (await this.database.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1))[0];
    if (!row) throw new OperationsError("SITE_SETTINGS_UNAVAILABLE");
    return settingsFromRow(row);
  }

  async updateSettings(input: Parameters<OperationsCommandPort["updateSettings"]>[0]) {
    return withTransaction(this.database, async (transaction) => {
      const actor = await requireTransactionActor(transaction, input.actor, "SUPER_ADMIN");
      const scope = "operations.site-settings.update";
      const replay = await readReceipt<{ settings: SiteSettings }>(transaction, actor.id, scope, input.metadata);
      if (replay) return replay;
      const row = (await transaction.select().from(siteSettings).where(eq(siteSettings.id, 1)).for("update").limit(1))[0];
      if (!row) throw new OperationsError("SITE_SETTINGS_UNAVAILABLE");
      const current = settingsFromRow(row);
      const next = updateSiteSettings({ current, expectedRevision: input.metadata.expectedRevision, patch: input.patch });
      const now = new Date();
      await transaction.update(siteSettings).set({
        revision: next.revision,
        brandName: next.brandName,
        tagline: next.tagline,
        supportUrl: next.supportUrl,
        featuresJson: { ...next.features },
        aiAllowedRolesJson: [...next.aiAllowedRoles],
        aiRequestsPerHour: next.aiRequestsPerHour,
        aiDailyCostLimitMicros: next.aiDailyCostLimitMicros,
        internalMaintenanceNote: next.internalMaintenanceNote,
        updatedByUserAccountId: actor.id,
        updatedAt: now,
      }).where(eq(siteSettings.id, 1));
      const body = { settings: next };
      await writeReceipt(transaction, { actorId: actor.id, scope, metadata: input.metadata, status: 200, body, revision: next.revision, now });
      await writeAuditAndOutbox(transaction, {
        actorId: actor.id,
        requestId: input.metadata.requestId,
        action: "SITE_SETTINGS_UPDATED",
        targetType: "SITE_SETTINGS",
        targetId: "GLOBAL",
        revision: next.revision,
        before: safeSettingsForAudit(current),
        after: safeSettingsForAudit(next),
        now,
      });
      return { status: 200, body, revision: next.revision, replayed: false };
    });
  }

  async getDashboard(): Promise<PublicOperationsDashboardDto> {
    const [accounts, activePlayers, publishedMatches, pendingEvents, latestAudit] = await Promise.all([
      this.database.select({ value: count() }).from(userAccounts),
      this.database.select({ value: count() }).from(players).where(eq(players.status, "ACTIVE")),
      this.database.select({ value: count() }).from(matchSeries).where(eq(matchSeries.status, "PUBLISHED")),
      this.database.select({ value: count() }).from(operationsOutbox).where(eq(operationsOutbox.status, "PENDING")),
      this.database.select({ createdAt: auditEvents.createdAt }).from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(1),
    ]);
    return {
      accounts: accounts[0]?.value ?? 0,
      activePlayers: activePlayers[0]?.value ?? 0,
      publishedMatches: publishedMatches[0]?.value ?? 0,
      pendingOperationsEvents: pendingEvents[0]?.value ?? 0,
      lastAuditAt: latestAudit[0]?.createdAt.toISOString() ?? null,
    };
  }

  async listAuditLogs(input: { page: number; pageSize: number; action?: string }) {
    const offset = (input.page - 1) * input.pageSize;
    const where = input.action ? eq(auditEvents.action, input.action) : undefined;
    const [rows, total] = await Promise.all([
      this.database.select({
        id: auditEvents.id,
        requestId: auditEvents.requestId,
        actorUserAccountId: auditEvents.actorUserAccountId,
        action: auditEvents.action,
        targetType: auditEvents.targetType,
        targetId: auditEvents.targetId,
        createdAt: auditEvents.createdAt,
      }).from(auditEvents).where(where).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(input.pageSize).offset(offset),
      this.database.select({ value: count() }).from(auditEvents).where(where),
    ]);
    const items: AuditLogDto[] = rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    return { items, totalCount: total[0]?.value ?? 0 };
  }

  async getAuditStats(): Promise<AuditStatsDto> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const [totals] = await this.database.select({
      totalEvents: sql<number>`count(*)::int`,
      eventsLast24Hours: sql<number>`count(*) filter (where ${auditEvents.createdAt} >= ${cutoff})::int`,
      uniqueActorsLast24Hours: sql<number>`count(distinct ${auditEvents.actorUserAccountId}) filter (where ${auditEvents.createdAt} >= ${cutoff})::int`,
      latestEventAt: sql<Date | null>`max(${auditEvents.createdAt})`.mapWith(auditEvents.createdAt),
    }).from(auditEvents);
    return {
      totalEvents: totals?.totalEvents ?? 0,
      eventsLast24Hours: totals?.eventsLast24Hours ?? 0,
      uniqueActorsLast24Hours: totals?.uniqueActorsLast24Hours ?? 0,
      latestEventAt: totals?.latestEventAt?.toISOString() ?? null,
    };
  }

  async listAiRequests(input: { page: number; pageSize: number; status?: AiRequestLedgerDto["status"] }) {
    const where = input.status ? eq(aiRequestLedger.status, input.status) : undefined;
    const [rows, total] = await Promise.all([
      this.database.select().from(aiRequestLedger).where(where).orderBy(desc(aiRequestLedger.createdAt), desc(aiRequestLedger.id)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
      this.database.select({ value: count() }).from(aiRequestLedger).where(where),
    ]);
    return {
      items: rows.map((row): AiRequestLedgerDto => ({
        id: row.id,
        requestId: row.requestId,
        actorUserAccountId: row.actorUserAccountId,
        actorRole: row.actorRole as AiRequestLedgerDto["actorRole"],
        status: row.status,
        promptHashPrefix: Buffer.from(row.promptHash).toString("hex").slice(0, 12),
        promptCharCount: row.promptCharCount,
        outputCharCount: row.outputCharCount,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        estimatedCostMicros: row.estimatedCostMicros,
        adapterKey: row.adapterKey,
        failureCode: row.failureCode,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
      })),
      totalCount: total[0]?.value ?? 0,
    };
  }

  async buildBackup(kind: "players" | "matches" | "mmr" | "rankings", actor: OperationsActor) {
    return withTransaction(this.database, async (transaction) => {
      const locked = await requireTransactionActor(transaction, actor, "SUPER_ADMIN");
      let csv: string;
      let rowCount: number;
      if (kind === "players") {
        const rows = await transaction.select({
          id: players.id,
          legacyId: players.legacyId,
          memberName: players.memberName,
          nickname: players.nickname,
          tagLine: players.tagLine,
          peakTier: players.peakTier,
          currentTier: players.currentTier,
          status: players.status,
          revision: players.revision,
          createdAt: players.createdAt,
          updatedAt: players.updatedAt,
        }).from(players).orderBy(players.id).limit(100_001);
        rowCount = rows.length;
        csv = buildCsvBackup({ rows, columns: [
          { header: "id", value: (row) => row.id }, { header: "legacy_id", value: (row) => row.legacyId },
          { header: "member_name", value: (row) => row.memberName }, { header: "nickname", value: (row) => row.nickname },
          { header: "tag_line", value: (row) => row.tagLine }, { header: "peak_tier", value: (row) => row.peakTier },
          { header: "current_tier", value: (row) => row.currentTier }, { header: "status", value: (row) => row.status },
          { header: "revision", value: (row) => row.revision }, { header: "created_at", value: (row) => row.createdAt },
          { header: "updated_at", value: (row) => row.updatedAt },
        ] });
      } else if (kind === "matches") {
        const rows = await transaction.select({
          id: matchSeries.id, legacyId: matchSeries.legacyId, seasonId: matchSeries.seasonId,
          title: matchSeries.title, playedOn: matchSeries.playedOn, blueWins: matchSeries.blueWins,
          redWins: matchSeries.redWins, gameCount: matchSeries.gameCount, status: matchSeries.status,
          revision: matchSeries.revision, publishedAt: matchSeries.publishedAt, updatedAt: matchSeries.updatedAt,
        }).from(matchSeries).orderBy(matchSeries.id).limit(100_001);
        rowCount = rows.length;
        csv = buildCsvBackup({ rows, columns: [
          { header: "id", value: (row) => row.id }, { header: "legacy_id", value: (row) => row.legacyId },
          { header: "season_id", value: (row) => row.seasonId }, { header: "title", value: (row) => row.title },
          { header: "played_on", value: (row) => row.playedOn }, { header: "blue_wins", value: (row) => row.blueWins },
          { header: "red_wins", value: (row) => row.redWins }, { header: "game_count", value: (row) => row.gameCount },
          { header: "status", value: (row) => row.status }, { header: "revision", value: (row) => row.revision },
          { header: "published_at", value: (row) => row.publishedAt }, { header: "updated_at", value: (row) => row.updatedAt },
        ] });
      } else if (kind === "mmr") {
        const rows = await transaction.select({
          generation: mmrPlayerProfiles.generation, playerId: mmrPlayerProfiles.playerId,
          overallScoreBp: mmrPlayerProfiles.overallScoreBp, confidenceBp: mmrPlayerProfiles.confidenceBp,
          sampleSize: mmrPlayerProfiles.sampleSize, formulaVersion: mmrPlayerProfiles.formulaVersion,
          calculatedAt: mmrPlayerProfiles.calculatedAt,
        }).from(mmrPlayerProfiles).orderBy(mmrPlayerProfiles.generation, mmrPlayerProfiles.playerId).limit(100_001);
        rowCount = rows.length;
        csv = buildCsvBackup({ rows, columns: [
          { header: "generation", value: (row) => row.generation }, { header: "player_id", value: (row) => row.playerId },
          { header: "overall_score_bp", value: (row) => row.overallScoreBp }, { header: "confidence_bp", value: (row) => row.confidenceBp },
          { header: "sample_size", value: (row) => row.sampleSize }, { header: "formula_version", value: (row) => row.formulaVersion },
          { header: "calculated_at", value: (row) => row.calculatedAt },
        ] });
      } else {
        const rows = await transaction.select({
          seasonId: playerSeasonStats.seasonId, playerId: playerSeasonStats.playerId,
          generation: playerSeasonStats.generation, totalGames: playerSeasonStats.totalGames,
          participationCount: playerSeasonStats.participationCount, wins: playerSeasonStats.wins,
          losses: playerSeasonStats.losses, mvpCount: playerSeasonStats.mvpCount,
          calculatedAt: playerSeasonStats.calculatedAt,
        }).from(playerSeasonStats).orderBy(playerSeasonStats.seasonId, playerSeasonStats.playerId).limit(100_001);
        rowCount = rows.length;
        csv = buildCsvBackup({ rows, columns: [
          { header: "season_id", value: (row) => row.seasonId }, { header: "player_id", value: (row) => row.playerId },
          { header: "generation", value: (row) => row.generation }, { header: "total_games", value: (row) => row.totalGames },
          { header: "participation_count", value: (row) => row.participationCount }, { header: "wins", value: (row) => row.wins },
          { header: "losses", value: (row) => row.losses }, { header: "mvp_count", value: (row) => row.mvpCount },
          { header: "calculated_at", value: (row) => row.calculatedAt },
        ] });
      }
      const now = new Date();
      await transaction.insert(auditEvents).values({
        requestId: randomUUID(), actorUserAccountId: locked.id, action: "CSV_BACKUP_DOWNLOADED",
        targetType: "BACKUP", targetId: kind, metadataJson: { kind, rowCount }, createdAt: now,
      });
      return csv;
    });
  }

  async runAdminCleanup(input: Parameters<OperationsCommandPort["runAdminCleanup"]>[0]) {
    return withTransaction(this.database, async (transaction) => {
      const actor = await requireTransactionActor(transaction, input.actor, "SUPER_ADMIN");
      const scope = `operations.cleanup.${input.kind}`;
      const replay = await readReceipt<{ runId: string; deleted: number; kind: string }>(transaction, actor.id, scope, input.metadata);
      if (replay) return replay;
      const settingsRow = (await transaction.select().from(siteSettings).where(eq(siteSettings.id, 1)).for("update").limit(1))[0];
      if (!settingsRow || settingsRow.revision !== input.metadata.expectedRevision) throw new OperationsError("STALE_SITE_SETTINGS_REVISION");
      if (!Number.isSafeInteger(input.retentionDays) || input.retentionDays < 30 || input.retentionDays > 3650) throw new OperationsError("INVALID_RETENTION_DAYS");
      const now = new Date();
      let deleted = 0;
      if (input.kind === "audit") {
        const rows = await transaction.delete(auditEvents).where(lt(auditEvents.createdAt, new Date(now.getTime() - input.retentionDays * 86_400_000))).returning({ id: auditEvents.id });
        deleted = rows.length;
      } else {
        const authRows = await transaction.delete(loginRateLimitBuckets).where(lt(loginRateLimitBuckets.expiresAt, now)).returning({ scope: loginRateLimitBuckets.scope });
        const matchRows = await transaction.delete(matchRateLimitBuckets).where(lt(matchRateLimitBuckets.expiresAt, now)).returning({ scope: matchRateLimitBuckets.scope });
        const receiptRows = await transaction.delete(operationsCommandReceipts).where(lt(operationsCommandReceipts.expiresAt, now)).returning({ id: operationsCommandReceipts.id });
        const nonceRows = await transaction.delete(jobNonceBindings).where(lt(jobNonceBindings.expiresAt, now)).returning({ id: jobNonceBindings.id });
        deleted = authRows.length + matchRows.length + receiptRows.length + nonceRows.length;
      }
      const runId = randomUUID();
      await transaction.insert(maintenanceRuns).values({ id: runId, requestId: input.metadata.requestId, jobName: `admin-${input.kind}`, status: "SUCCEEDED", countsJson: { deleted }, actorUserAccountId: actor.id, startedAt: now, completedAt: now });
      const body = { runId, deleted, kind: input.kind };
      await writeReceipt(transaction, { actorId: actor.id, scope, metadata: input.metadata, status: 200, body, revision: settingsRow.revision, now });
      await writeAuditAndOutbox(transaction, { actorId: actor.id, requestId: input.metadata.requestId, action: "MAINTENANCE_COMPLETED", targetType: "MAINTENANCE_RUN", targetId: runId, revision: settingsRow.revision, metadata: { kind: input.kind, deleted, retentionDays: input.retentionDays }, now });
      return { status: 200, body, revision: settingsRow.revision, replayed: false };
    });
  }

  async runSignedMaintenance(input: Parameters<OperationsCommandPort["runSignedMaintenance"]>[0]) {
    return withTransaction(this.database, async (transaction) => {
      const nonceHash = hash(`klol-v2:operations-job-nonce:v1\0${input.jobName}\0${input.nonce}`);
      const requestHash = bufferFromHex(input.requestHashHex, "INVALID_REQUEST_HASH");
      const lockKey = `${input.jobName}:${nonceHash.toString("hex")}`;
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const previous = (await transaction.select().from(jobNonceBindings).where(and(eq(jobNonceBindings.jobName, input.jobName), eq(jobNonceBindings.nonceHash, nonceHash))).limit(1))[0];
      if (previous && previous.expiresAt > new Date()) throw new OperationsError("JOB_NONCE_REPLAYED");
      const now = new Date();
      if (previous) await transaction.delete(jobNonceBindings).where(eq(jobNonceBindings.id, previous.id));
      await transaction.insert(jobNonceBindings).values({ id: randomUUID(), jobName: input.jobName, nonceHash, requestHash, createdAt: now, expiresAt: new Date(now.getTime() + JOB_NONCE_TTL_MS) });
      const authRows = await transaction.delete(loginRateLimitBuckets).where(lt(loginRateLimitBuckets.expiresAt, now)).returning({ scope: loginRateLimitBuckets.scope });
      const matchRows = await transaction.delete(matchRateLimitBuckets).where(lt(matchRateLimitBuckets.expiresAt, now)).returning({ scope: matchRateLimitBuckets.scope });
      const receiptRows = await transaction.delete(operationsCommandReceipts).where(lt(operationsCommandReceipts.expiresAt, now)).returning({ id: operationsCommandReceipts.id });
      const nonceRows = await transaction.delete(jobNonceBindings).where(lt(jobNonceBindings.expiresAt, now)).returning({ id: jobNonceBindings.id });
      const counts = { authRateLimits: authRows.length, matchRateLimits: matchRows.length, receipts: receiptRows.length, jobNonces: nonceRows.length };
      const runId = randomUUID();
      await transaction.insert(maintenanceRuns).values({ id: runId, requestId: input.requestId, jobName: input.jobName, status: "SUCCEEDED", countsJson: counts, startedAt: now, completedAt: now });
      await writeAuditAndOutbox(transaction, { actorId: null, requestId: input.requestId, action: "SIGNED_MAINTENANCE_COMPLETED", targetType: "MAINTENANCE_RUN", targetId: runId, revision: 0, metadata: counts, now });
      return { runId, counts };
    });
  }

  async runSignedKakaoDailyClose(input: Parameters<OperationsCommandPort["runSignedKakaoDailyClose"]>[0]) {
    if (!Number.isSafeInteger(input.idleHours) || input.idleHours < 1 || input.idleHours > 168) {
      throw new OperationsError("INVALID_IDLE_HOURS");
    }
    if (!Number.isSafeInteger(input.maximumClosures) || input.maximumClosures < 1 || input.maximumClosures > 500) {
      throw new OperationsError("INVALID_MAXIMUM_CLOSURES");
    }
    return withTransaction(this.database, async (transaction) => {
      const nonceHash = hash(`klol-v2:operations-job-nonce:v1\0${input.jobName}\0${input.nonce}`);
      const requestHash = bufferFromHex(input.requestHashHex, "INVALID_REQUEST_HASH");
      const lockKey = `${input.jobName}:${nonceHash.toString("hex")}`;
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const previous = (await transaction.select().from(jobNonceBindings).where(and(eq(jobNonceBindings.jobName, input.jobName), eq(jobNonceBindings.nonceHash, nonceHash))).limit(1))[0];
      const now = new Date();
      if (previous && previous.expiresAt > now) {
        if (!timingSafeEqual(previous.requestHash, requestHash)) throw new OperationsError("JOB_NONCE_REPLAYED");
        const completed = (await transaction.select().from(maintenanceRuns).where(and(
          eq(maintenanceRuns.requestId, input.requestId),
          eq(maintenanceRuns.jobName, input.jobName),
          eq(maintenanceRuns.status, "SUCCEEDED"),
        )).limit(1))[0];
        if (!completed) throw new OperationsError("JOB_NONCE_REPLAYED");
        return { runId: completed.id, counts: completed.countsJson };
      }
      if (previous) await transaction.delete(jobNonceBindings).where(eq(jobNonceBindings.id, previous.id));
      await transaction.insert(jobNonceBindings).values({ id: randomUUID(), jobName: input.jobName, nonceHash, requestHash, createdAt: now, expiresAt: new Date(now.getTime() + KAKAO_DAILY_CLOSE_NONCE_TTL_MS) });

      const cutoff = new Date(now.getTime() - input.idleHours * 60 * 60 * 1_000);
      const candidates = await transaction
        .select()
        .from(recruitParties)
        .where(and(
          eq(recruitParties.status, "IN_PROGRESS"),
          lte(recruitParties.lastActivityAt, cutoff),
          or(isNull(recruitParties.protectedUntil), lte(recruitParties.protectedUntil, now)),
        ))
        .orderBy(asc(recruitParties.lastActivityAt), asc(recruitParties.id))
        .limit(input.maximumClosures)
        .for("update");

      for (const party of candidates) {
        const eventRequestId = randomUUID();
        const nextRevision = party.revision + 1;
        const updated = await transaction
          .update(recruitParties)
          .set({ status: "FINISHED", revision: nextRevision, lastActivityAt: now, updatedAt: now })
          .where(and(eq(recruitParties.id, party.id), eq(recruitParties.revision, party.revision), eq(recruitParties.status, "IN_PROGRESS")))
          .returning({ id: recruitParties.id });
        if (updated.length !== 1) throw new OperationsError("RECRUIT_DAILY_CLOSE_CONFLICT");
        await transaction.insert(auditEvents).values({
          requestId: eventRequestId,
          actorUserAccountId: null,
          action: "RECRUIT_PARTY_AUTO_FINISHED",
          targetType: "RECRUIT_PARTY",
          targetId: party.id,
          beforeJson: { status: party.status, revision: party.revision, lastActivityAt: party.lastActivityAt.toISOString() },
          afterJson: { status: "FINISHED", revision: nextRevision, lastActivityAt: now.toISOString() },
          metadataJson: { jobRequestId: input.requestId, idleHours: input.idleHours },
          createdAt: now,
        });
        await transaction.insert(recruitingOutbox).values({
          id: `party:${party.id}:${nextRevision}:RECRUIT_PARTY_AUTO_FINISHED`,
          requestId: eventRequestId,
          aggregateType: "RECRUIT_PARTY",
          aggregateId: party.id,
          aggregateRevision: nextRevision,
          eventType: "RECRUIT_PARTY_AUTO_FINISHED",
          dedupeKey: `party:${party.id}:revision:${nextRevision}`,
          payloadJson: { id: party.id, status: "FINISHED", revision: nextRevision },
          createdAt: now,
        });
      }

      const operatingDate = recruitingOperatingDateKey(now);
      const staleDrafts = await transaction
        .select()
        .from(recruitParties)
        .where(and(
          eq(recruitParties.status, "DRAFT"),
          lt(recruitParties.recruitDate, operatingDate),
        ))
        .orderBy(asc(recruitParties.recruitDate), asc(recruitParties.resetSequence), asc(recruitParties.recruitNumber), asc(recruitParties.id))
        .limit(input.maximumClosures)
        .for("update");

      for (const party of staleDrafts) {
        const eventRequestId = randomUUID();
        const nextRevision = party.revision + 1;
        const updated = await transaction
          .update(recruitParties)
          .set({ status: "RESET", revision: nextRevision, lastActivityAt: now, updatedAt: now })
          .where(and(
            eq(recruitParties.id, party.id),
            eq(recruitParties.revision, party.revision),
            eq(recruitParties.status, "DRAFT"),
          ))
          .returning({ id: recruitParties.id });
        if (updated.length !== 1) throw new OperationsError("RECRUIT_DRAFT_DAILY_RESET_CONFLICT");
        await transaction.insert(auditEvents).values({
          requestId: eventRequestId,
          actorUserAccountId: null,
          action: "RECRUIT_PARTY_DRAFT_AUTO_RESET",
          targetType: "RECRUIT_PARTY",
          targetId: party.id,
          beforeJson: { status: party.status, revision: party.revision, recruitDate: party.recruitDate },
          afterJson: { status: "RESET", revision: nextRevision, recruitDate: party.recruitDate },
          metadataJson: { jobRequestId: input.requestId, operatingDate },
          createdAt: now,
        });
        await transaction.insert(recruitingOutbox).values({
          id: `party:${party.id}:${nextRevision}:RECRUIT_PARTY_DRAFT_AUTO_RESET`,
          requestId: eventRequestId,
          aggregateType: "RECRUIT_PARTY",
          aggregateId: party.id,
          aggregateRevision: nextRevision,
          eventType: "RECRUIT_PARTY_DRAFT_AUTO_RESET",
          dedupeKey: `party:${party.id}:revision:${nextRevision}`,
          payloadJson: { id: party.id, status: "RESET", revision: nextRevision },
          createdAt: now,
        });
      }

      const scrimCandidates = await transaction
        .select()
        .from(scrimRecruits)
        .where(and(
          inArray(scrimRecruits.status, ["RECRUITING", "MATCHED", "CONFIRMED"]),
          lt(scrimRecruits.recruitDate, operatingDate),
        ))
        .orderBy(asc(scrimRecruits.recruitDate), asc(scrimRecruits.scrimNumber), asc(scrimRecruits.id))
        .limit(input.maximumClosures)
        .for("update");

      for (const scrim of scrimCandidates) {
        const eventRequestId = randomUUID();
        const nextRevision = scrim.revision + 1;
        const updated = await transaction
          .update(scrimRecruits)
          .set({ status: "COMPLETED", revision: nextRevision, updatedAt: now })
          .where(and(
            eq(scrimRecruits.id, scrim.id),
            eq(scrimRecruits.revision, scrim.revision),
            inArray(scrimRecruits.status, ["RECRUITING", "MATCHED", "CONFIRMED"]),
          ))
          .returning({ id: scrimRecruits.id });
        if (updated.length !== 1) throw new OperationsError("SCRIM_DAILY_CLOSE_CONFLICT");
        await transaction.insert(auditEvents).values({
          requestId: eventRequestId,
          actorUserAccountId: null,
          action: "SCRIM_RECRUIT_AUTO_COMPLETED",
          targetType: "SCRIM_RECRUIT",
          targetId: scrim.id,
          beforeJson: { status: scrim.status, revision: scrim.revision, recruitDate: scrim.recruitDate },
          afterJson: { status: "COMPLETED", revision: nextRevision, recruitDate: scrim.recruitDate },
          metadataJson: { jobRequestId: input.requestId, operatingDate },
          createdAt: now,
        });
        await transaction.insert(recruitingOutbox).values({
          id: `scrim:${scrim.id}:${nextRevision}:SCRIM_RECRUIT_AUTO_COMPLETED`,
          requestId: eventRequestId,
          aggregateType: "SCRIM_RECRUIT",
          aggregateId: scrim.id,
          aggregateRevision: nextRevision,
          eventType: "SCRIM_RECRUIT_AUTO_COMPLETED",
          dedupeKey: `scrim:${scrim.id}:revision:${nextRevision}`,
          payloadJson: { id: scrim.id, status: "COMPLETED", revision: nextRevision },
          createdAt: now,
        });
      }

      const counts = {
        partiesClosed: candidates.length,
        partyDraftsReset: staleDrafts.length,
        scrimsClosed: scrimCandidates.length,
      };
      const runId = randomUUID();
      await transaction.insert(maintenanceRuns).values({ id: runId, requestId: input.requestId, jobName: input.jobName, status: "SUCCEEDED", countsJson: counts, startedAt: now, completedAt: now });
      await writeAuditAndOutbox(transaction, { actorId: null, requestId: input.requestId, action: "KAKAO_DAILY_CLOSE_COMPLETED", targetType: "MAINTENANCE_RUN", targetId: runId, revision: 0, metadata: { ...counts, idleHours: input.idleHours, maximumClosures: input.maximumClosures }, now });
      return { runId, counts };
    });
  }

  async requestAi(input: Parameters<OperationsCommandPort["requestAi"]>[0]) {
    return withTransaction(this.database, async (transaction) => {
      const actor = await requireTransactionActor(transaction, input.actor, "USER");
      const scope = "operations.ai.request";
      const replay = await readReceipt<AiRequestResultBody>(transaction, actor.id, scope, input.metadata);
      if (replay) return replay;
      const settingsRow = (await transaction.select().from(siteSettings).where(eq(siteSettings.id, 1)).for("update").limit(1))[0];
      if (!settingsRow || settingsRow.revision !== input.metadata.expectedRevision) throw new OperationsError("STALE_SITE_SETTINGS_REVISION");
      const settings = settingsFromRow(settingsRow);
      const hourAgo = new Date(Date.now() - 3_600_000);
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const [usage] = await transaction.select({
        usedInWindow: sql<number>`count(*) filter (where ${aiRequestLedger.createdAt} >= ${hourAgo})::int`,
        spentTodayMicros: sql<number>`coalesce(sum(${aiRequestLedger.estimatedCostMicros}) filter (where ${aiRequestLedger.createdAt} >= ${startOfDay} and ${aiRequestLedger.status} = 'SUCCEEDED'), 0)::bigint`,
      }).from(aiRequestLedger).where(eq(aiRequestLedger.actorUserAccountId, actor.id));
      const decision = authorizeAiRequest({ settings, accountStatus: actor.status, role: actor.role, prompt: input.prompt, usedInWindow: usage?.usedInWindow ?? 0, spentTodayMicros: Number(usage?.spentTodayMicros ?? 0) });
      const now = new Date();
      const ledgerId = randomUUID();
      const promptHash = hash(input.prompt.normalize("NFKC").trim());
      if (!decision.allowed) {
        const body: AiRequestResultBody = { ok: false, code: decision.code, requestId: input.metadata.requestId };
        await transaction.insert(aiRequestLedger).values({ id: ledgerId, requestId: input.metadata.requestId, actorUserAccountId: actor.id, actorRole: actor.role, status: "DENIED", promptHash, promptCharCount: input.prompt.length, adapterKey: this.ai.key, failureCode: decision.code, createdAt: now, completedAt: now });
        await writeReceipt(transaction, { actorId: actor.id, scope, metadata: input.metadata, status: 403, body, revision: settings.revision, now });
        await writeAuditAndOutbox(transaction, { actorId: actor.id, requestId: input.metadata.requestId, action: "AI_REQUEST_DENIED", targetType: "AI_REQUEST", targetId: ledgerId, revision: settings.revision, metadata: { code: decision.code }, now });
        return { status: 403, body, revision: settings.revision, replayed: false };
      }
      const remainingCost = settings.aiDailyCostLimitMicros - Number(usage?.spentTodayMicros ?? 0);
      let body: AiRequestResultBody;
      let status: number;
      try {
        const result = await this.ai.complete({ prompt: decision.normalizedPrompt, maximumCostMicros: remainingCost });
        if (!Number.isSafeInteger(result.estimatedCostMicros) || result.estimatedCostMicros < 0 || result.estimatedCostMicros > remainingCost) throw new OperationsError("AI_ADAPTER_COST_INVALID");
        if (!Number.isSafeInteger(result.inputTokens) || result.inputTokens < 0 || !Number.isSafeInteger(result.outputTokens) || result.outputTokens < 0 || result.text.length > 20_000) throw new OperationsError("AI_ADAPTER_RESPONSE_INVALID");
        body = { ok: true, answer: result.text, requestId: input.metadata.requestId };
        status = 200;
        await transaction.insert(aiRequestLedger).values({ id: ledgerId, requestId: input.metadata.requestId, actorUserAccountId: actor.id, actorRole: actor.role, status: "SUCCEEDED", promptHash, promptCharCount: decision.normalizedPrompt.length, outputCharCount: result.text.length, inputTokens: result.inputTokens, outputTokens: result.outputTokens, estimatedCostMicros: result.estimatedCostMicros, adapterKey: this.ai.key, createdAt: now, completedAt: new Date() });
      } catch (error) {
        const code = error instanceof OperationsError ? error.code : "AI_ADAPTER_UNAVAILABLE";
        body = { ok: false, code, requestId: input.metadata.requestId };
        status = 503;
        await transaction.insert(aiRequestLedger).values({ id: ledgerId, requestId: input.metadata.requestId, actorUserAccountId: actor.id, actorRole: actor.role, status: "FAILED", promptHash, promptCharCount: decision.normalizedPrompt.length, estimatedCostMicros: AI_FAILURE_COST_MICROS, adapterKey: this.ai.key, failureCode: code, createdAt: now, completedAt: new Date() });
      }
      await writeReceipt(transaction, { actorId: actor.id, scope, metadata: input.metadata, status, body, revision: settings.revision, now });
      await writeAuditAndOutbox(transaction, { actorId: actor.id, requestId: input.metadata.requestId, action: body.ok ? "AI_REQUEST_SUCCEEDED" : "AI_REQUEST_FAILED", targetType: "AI_REQUEST", targetId: ledgerId, revision: settings.revision, metadata: { adapterKey: this.ai.key, status }, now });
      return { status, body, revision: settings.revision, replayed: false };
    });
  }
}
