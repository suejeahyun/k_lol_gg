import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, lte, sql } from "drizzle-orm";

import { ADMIN_MUTATION_SESSION_POLICY, lockTransactionSessionActor } from "@/modules/auth/infrastructure/transaction-session-guard";
import type { OperationsActor, OperationsCommandMetadata, OperationsCommandResult } from "@/modules/operations/application/ports";
import { auditEvents } from "@/platform/db/schema/audit";
import type { V2Database } from "@/platform/db/database";
import { kakaoImageSessions, kakaoOperationSettings, recruitingCommandReceipts, recruitingOutbox } from "@/platform/db/schema/recruiting";
import { withTransaction, type V2Transaction } from "@/platform/db/transaction";

import type { KakaoFeature, KakaoOperationSettingsDto, KakaoOperationSettingsPatch } from "./domain";

const RECEIPT_TTL = 24 * 60 * 60 * 1_000;
const SETTINGS_TARGET_ID = "00000000-0000-4000-8000-000000000009";

export class KakaoAdminError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "IDEMPOTENCY_MISMATCH" | "SESSION_STALE" | "PRECONDITION_FAILED" | "UNAVAILABLE") { super(code); }
}

const sameBytes = (left: Uint8Array, right: Uint8Array) => Buffer.from(left).equals(Buffer.from(right));
const keyHash = (key: string) => createHash("sha256").update(`klol-v2:kakao-admin-key:v1\0${key}`).digest();
const requestHash = (scope: string, metadata: OperationsCommandMetadata) => createHash("sha256").update(`klol-v2:kakao-admin-request:v1\0${scope}\0${metadata.expectedRevision}\0${metadata.requestHashHex}`).digest();

function dto(row: typeof kakaoOperationSettings.$inferSelect): KakaoOperationSettingsDto {
  return Object.freeze({
    revision: row.revision, globalEnabled: row.globalEnabled, maintenanceMode: row.maintenanceMode,
    playerSearchEnabled: row.playerSearchEnabled, seasonApplicationsEnabled: row.seasonApplicationsEnabled,
    imageReceiveEnabled: row.imageReceiveEnabled, recruitingEnabled: row.recruitingEnabled,
    scheduledNoticeEnabled: row.scheduledNoticeEnabled, maxMessageLength: row.maxMessageLength,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export class PostgresKakaoAdmin {
  constructor(private readonly database: V2Database) {}

  async getSettings() {
    const row = (await this.database.select().from(kakaoOperationSettings).where(eq(kakaoOperationSettings.id, 1)).limit(1))[0];
    if (!row) throw new KakaoAdminError("UNAVAILABLE");
    return dto(row);
  }

  async isFeatureEnabled(feature: KakaoFeature) {
    const settings = await this.getSettings();
    return settings.globalEnabled && !settings.maintenanceMode && settings[feature];
  }

  async updateSettings(input: Readonly<{ actor: OperationsActor; metadata: OperationsCommandMetadata; patch: KakaoOperationSettingsPatch }>): Promise<OperationsCommandResult<{ settings: KakaoOperationSettingsDto }>> {
    const scope = "admin:kakao:settings:update";
    return withTransaction(this.database, async (transaction) => {
      const actor = await this.requireSuper(transaction, input.actor);
      const replay = await this.claim(transaction, actor.id, scope, input.metadata);
      if (replay) return replay as OperationsCommandResult<{ settings: KakaoOperationSettingsDto }>;
      const row = (await transaction.select().from(kakaoOperationSettings).where(eq(kakaoOperationSettings.id, 1)).for("update").limit(1))[0];
      if (!row) throw new KakaoAdminError("UNAVAILABLE");
      if (row.revision !== input.metadata.expectedRevision) throw new KakaoAdminError("PRECONDITION_FAILED");
      const next = { ...dto(row), ...input.patch, revision: row.revision + 1, updatedAt: new Date().toISOString() };
      await transaction.update(kakaoOperationSettings).set({ ...input.patch, revision: next.revision, updatedByUserAccountId: actor.id, updatedAt: new Date(next.updatedAt) }).where(eq(kakaoOperationSettings.id, 1));
      const body = { settings: Object.freeze(next) };
      await this.finish(transaction, actor.id, scope, input.metadata, 200, body, next.revision, "KAKAO_SETTINGS_UPDATED", { changedKeys: Object.keys(input.patch).sort() });
      return { status: 200, body, revision: next.revision, replayed: false };
    });
  }

  async repairExpiredSessions(input: Readonly<{ actor: OperationsActor; metadata: OperationsCommandMetadata }>): Promise<OperationsCommandResult<{ expiredSessionCount: number }>> {
    const scope = "admin:kakao:health:repair";
    return withTransaction(this.database, async (transaction) => {
      const actor = await this.requireSuper(transaction, input.actor);
      const replay = await this.claim(transaction, actor.id, scope, input.metadata);
      if (replay) return replay as OperationsCommandResult<{ expiredSessionCount: number }>;
      const settings = (await transaction.select().from(kakaoOperationSettings).where(eq(kakaoOperationSettings.id, 1)).for("update").limit(1))[0];
      if (!settings) throw new KakaoAdminError("UNAVAILABLE");
      if (settings.revision !== input.metadata.expectedRevision) throw new KakaoAdminError("PRECONDITION_FAILED");
      const now = new Date();
      const expired = await transaction.update(kakaoImageSessions).set({ status: "EXPIRED", cancelledAt: now, updatedAt: now }).where(and(eq(kakaoImageSessions.status, "ACTIVE"), lte(kakaoImageSessions.expiresAt, now))).returning({ id: kakaoImageSessions.id });
      const body = { expiredSessionCount: expired.length };
      await this.finish(transaction, actor.id, scope, input.metadata, 200, body, settings.revision, "KAKAO_HEALTH_REPAIRED", body);
      return { status: 200, body, revision: settings.revision, replayed: false };
    });
  }

  private async requireSuper(transaction: V2Transaction, actor: OperationsActor) {
    const locked = await lockTransactionSessionActor(transaction, actor.session, new Date(), { ...ADMIN_MUTATION_SESSION_POLICY, minimumRole: "SUPER_ADMIN" });
    if (!locked || locked.role !== "SUPER_ADMIN") throw new KakaoAdminError("SESSION_STALE");
    return locked;
  }

  private async claim(transaction: V2Transaction, actorId: string, scope: string, metadata: OperationsCommandMetadata) {
    const principal = `account:${actorId}`;
    const key = keyHash(metadata.requestKey);
    const request = requestHash(scope, metadata);
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${principal}:${scope}:${key.toString("hex")}`}, 0))`);
    const current = (await transaction.select().from(recruitingCommandReceipts).where(and(eq(recruitingCommandReceipts.actorPrincipalId, principal), eq(recruitingCommandReceipts.scope, scope), eq(recruitingCommandReceipts.keyHash, key))).limit(1))[0];
    const now = new Date();
    if (current && current.expiresAt > now) {
      if (!sameBytes(current.requestHash, request) || current.bodyDigestHex !== metadata.requestHashHex) throw new KakaoAdminError("IDEMPOTENCY_MISMATCH");
      if (current.responseStatus && current.responseJson && current.responseRevision !== null) return { status: current.responseStatus, body: current.responseJson, revision: current.responseRevision, replayed: true };
      throw new KakaoAdminError("UNAVAILABLE");
    }
    const values = { actorPrincipalId: principal, scope, keyHash: key, requestHash: request, bodyDigestHex: metadata.requestHashHex, responseStatus: null, responseJson: null, responseRevision: null, createdAt: now, expiresAt: new Date(now.getTime() + RECEIPT_TTL) };
    if (current) await transaction.update(recruitingCommandReceipts).set(values).where(eq(recruitingCommandReceipts.id, current.id));
    else await transaction.insert(recruitingCommandReceipts).values({ id: randomUUID(), ...values });
    return null;
  }

  private async finish(transaction: V2Transaction, actorId: string, scope: string, metadata: OperationsCommandMetadata, status: number, body: Record<string, unknown>, revision: number, action: string, auditMetadata: Record<string, unknown>) {
    const principal = `account:${actorId}`;
    const updated = await transaction.update(recruitingCommandReceipts).set({ responseStatus: status, responseJson: body, responseRevision: revision }).where(and(eq(recruitingCommandReceipts.actorPrincipalId, principal), eq(recruitingCommandReceipts.scope, scope), eq(recruitingCommandReceipts.keyHash, keyHash(metadata.requestKey)), eq(recruitingCommandReceipts.requestHash, requestHash(scope, metadata)), isNull(recruitingCommandReceipts.responseStatus))).returning({ id: recruitingCommandReceipts.id });
    if (updated.length !== 1) throw new KakaoAdminError("UNAVAILABLE");
    await transaction.insert(auditEvents).values({ requestId: metadata.requestId, actorUserAccountId: actorId, action, targetType: "KAKAO_SETTINGS", targetId: SETTINGS_TARGET_ID, metadataJson: auditMetadata, createdAt: new Date() });
    await transaction.insert(recruitingOutbox).values({ id: `kakao-settings:${metadata.requestId}`, requestId: metadata.requestId, aggregateType: "KAKAO_SETTINGS", aggregateId: SETTINGS_TARGET_ID, aggregateRevision: revision, eventType: action, dedupeKey: `kakao-settings:${metadata.requestId}:${action}`, payloadJson: { revision, ...auditMetadata }, createdAt: new Date() });
  }
}
