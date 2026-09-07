import { createHash, randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import type { PrivateAssetActor, PrivateAssetResourceBinding } from "@/modules/assets/application/private-asset-policy";
import type {
  PrivateAssetAuditEvent,
  PrivateAssetAuthorizationPort,
  PrivateAssetRepository,
  PrivateAssetTransaction,
  PrivateAssetUnitOfWork,
} from "@/modules/assets/application/ports/private-asset-ports";
import { PRIVATE_ASSET_PURPOSES, type PrivateAssetBinding, type PrivateAssetListQuery, type PrivateAssetPurpose, type PrivateAssetRecord } from "@/modules/assets/domain/private-asset";
import {
  ADMIN_MUTATION_SESSION_POLICY,
  APPROVED_ACCOUNT_MUTATION_SESSION_POLICY,
  lockTransactionSessionActor,
} from "@/modules/auth/infrastructure/transaction-session-guard";
import { auditEvents } from "@/platform/db/schema/audit";
import { userAccounts } from "@/platform/db/schema/auth";
import {
  disciplineAssetBindings,
  disciplineAssetCleanupOutcomes,
  disciplineBanReviews,
  disciplineCautionConversions,
  disciplineCommandReceipts,
  disciplineEvidence,
  disciplineOutbox,
  disciplineRecords,
  disciplineResolutionTasks,
} from "@/platform/db/schema/discipline";
import { privateAssets } from "@/platform/db/schema/matches";
import { players } from "@/platform/db/schema/registry";
import type { V2Database } from "@/platform/db/database";
import type { DatabaseExecutor, V2Transaction } from "@/platform/db/transaction";
import { withTransaction } from "@/platform/db/transaction";

import type {
  AdminDisciplineRecordDto,
  CreateDisciplineRecordInput,
  CurrentDisciplineActor,
  DisciplineAdminCommandPort,
  DisciplineAdminListQuery,
  DisciplineAdminMutationResult,
  DisciplineAuditEvent,
  DisciplineAuditPort,
  DisciplineAuthorizationPort,
  DisciplineCommandReceipt,
  DisciplineEvidenceDto,
  DisciplineMutationEnvelope,
  DisciplineOutboxEvent,
  DisciplineOutboxPort,
  DisciplineQueryPort,
  DisciplineReceiptClaim,
  DisciplineReceiptPort,
  DisciplineRepository,
  DisciplineTransaction,
  DisciplineUnitOfWork,
  OwnerDisciplineTaskDto,
  ReadyDisciplineEvidenceAsset,
  UpdateDisciplineRecordInput,
} from "../application/ports";
import type { DisciplineCommand } from "../application/commands";
import { DisciplineApplicationError } from "../application/command-handler";
import type { DisciplineEvidence as DomainEvidence, DisciplineTask } from "../domain/evidence-task";
import { buildPublicDisciplineStatistics } from "../domain/public-statistics";
import { disciplineIdentityKey, disciplineResolutionDueAt, planBanReview, planCautionConversion, requiredResolutionGameCount } from "../domain/policy";

const RECEIPT_TTL_MS = 24 * 60 * 60 * 1_000;

function sameBytes(left: Buffer | Uint8Array, right: Buffer | Uint8Array) {
  return Buffer.from(left).equals(Buffer.from(right));
}

function assetRecord(row: typeof privateAssets.$inferSelect): PrivateAssetRecord | null {
  if (!["image/png", "image/jpeg", "image/webp"].includes(row.contentType)) return null;
  if (!PRIVATE_ASSET_PURPOSES.includes(row.purpose as PrivateAssetPurpose)) return null;
  return {
    id: row.id,
    createdByUserAccountId: row.createdByUserAccountId,
    ingestSource: row.ingestSource,
    storageProvider: row.storageProvider,
    storageKey: row.storageKey,
    originalFileName: row.originalFileName,
    contentType: row.contentType as PrivateAssetRecord["contentType"],
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    sha256: row.sha256,
    purpose: row.purpose as PrivateAssetPurpose,
    status: row.status,
    readyAt: row.readyAt?.toISOString() ?? null,
    deleteRequestedAt: row.deleteRequestedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function receiptBody(row: typeof disciplineCommandReceipts.$inferSelect): DisciplineCommandReceipt | null {
  const body = row.responseJson as DisciplineCommandReceipt["body"];
  if (!body || typeof body.revision !== "number") return null;
  return {
    principalId: row.principalId,
    scope: row.scope,
    keyHash: row.keyHash,
    requestHash: row.requestHash,
    bodyDigestHex: row.bodyDigestHex,
    body,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

type RecordRow = typeof disciplineRecords.$inferSelect;
type TaskRow = typeof disciplineResolutionTasks.$inferSelect;

function cleanText(value: string, maximum: number, code: string) {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) throw new DisciplineApplicationError("INVALID_COMMAND", code);
  return normalized;
}

function cleanOptionalText(value: string | null, maximum: number, code: string) {
  if (value === null || value.trim() === "") return null;
  return cleanText(value, maximum, code);
}

async function evidenceForTask(executor: DatabaseExecutor, taskId: string): Promise<readonly DisciplineEvidenceDto[]> {
  const rows = await executor.select({
    assetId: privateAssets.id,
    contentType: privateAssets.contentType,
    byteSize: privateAssets.byteSize,
    width: privateAssets.width,
    height: privateAssets.height,
    status: privateAssets.status,
    submittedAt: disciplineEvidence.submittedAt,
  }).from(disciplineAssetBindings)
    .innerJoin(privateAssets, eq(privateAssets.id, disciplineAssetBindings.privateAssetId))
    .leftJoin(disciplineEvidence, eq(disciplineEvidence.privateAssetId, privateAssets.id))
    .where(eq(disciplineAssetBindings.taskId, taskId))
    .orderBy(asc(disciplineAssetBindings.createdAt), asc(privateAssets.id));
  return rows.map((row) => ({ ...row, submittedAt: row.submittedAt?.toISOString() ?? null }));
}

async function ownerTaskDto(executor: DatabaseExecutor, row: TaskRow): Promise<OwnerDisciplineTaskDto> {
  const evidence = await evidenceForTask(executor, row.id);
  const boundary = row.reviewBoundaryAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const submittedEvidenceCount = evidence.filter((item) => item.submittedAt !== null && Date.parse(item.submittedAt) > boundary).length;
  return {
    id: row.id,
    publicCode: row.publicCode,
    revision: row.revision,
    category: row.category,
    requiredGameCount: row.requiredGameCount,
    submittedEvidenceCount,
    remainingEvidenceCount: Math.max(0, row.requiredGameCount - submittedEvidenceCount),
    dueAt: row.dueAt.toISOString(),
    status: row.status,
    reviewNote: row.reviewNote,
    evidence,
  };
}

async function adminRecordDto(executor: DatabaseExecutor, row: RecordRow): Promise<AdminDisciplineRecordDto> {
  const task = (await executor.select().from(disciplineResolutionTasks).where(eq(disciplineResolutionTasks.disciplineRecordId, row.id)).limit(1))[0];
  return {
    id: row.id,
    revision: row.revision,
    userAccountId: row.userAccountId,
    playerId: row.playerId,
    targetName: row.targetName,
    targetNickname: row.targetNickname,
    targetTagLine: row.targetTagLine,
    type: row.type,
    category: row.category,
    source: row.source,
    reason: row.reason,
    internalNote: row.internalNote,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    task: task ? await ownerTaskDto(executor, task) : null,
  };
}

async function existingAdminReceipt(executor: DatabaseExecutor, envelope: DisciplineMutationEnvelope) {
  const row = (await executor.select().from(disciplineCommandReceipts).where(and(
    eq(disciplineCommandReceipts.principalId, envelope.actorSession.userAccountId),
    eq(disciplineCommandReceipts.scope, envelope.scope),
    eq(disciplineCommandReceipts.keyHash, envelope.keyHash),
    sql<boolean>`${disciplineCommandReceipts.expiresAt} > clock_timestamp()`,
  )).limit(1))[0];
  if (!row) return null;
  if (!sameBytes(row.requestHash, envelope.requestHash)) throw new DisciplineApplicationError("IDEMPOTENCY_MISMATCH", "The command key was used with a different request.");
  const revision = Number(String(row.responseEtag ?? "").replaceAll('"', ""));
  return { body: row.responseJson, status: row.responseStatus, revision: Number.isSafeInteger(revision) ? revision : 0, replayed: true } satisfies DisciplineAdminMutationResult;
}

async function writeAdminEvidence(transaction: V2Transaction, input: Readonly<{
  envelope: DisciplineMutationEnvelope;
  action: string;
  recordId: string;
  revision: number;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  status: number;
  now: Date;
}>) {
  const body = { record: input.after };
  await transaction.insert(disciplineCommandReceipts).values({
    id: randomUUID(), principalId: input.envelope.actorSession.userAccountId, actorUserAccountId: input.envelope.actorSession.userAccountId,
    scope: input.envelope.scope, keyHash: input.envelope.keyHash, requestHash: input.envelope.requestHash,
    bodyDigestHex: Buffer.from(input.envelope.requestHash).toString("hex"), responseStatus: input.status,
    responseJson: body, responseEtag: `"${input.revision}"`, createdAt: input.now, expiresAt: new Date(input.now.getTime() + RECEIPT_TTL_MS),
  });
  await transaction.insert(auditEvents).values({
    requestId: input.envelope.requestId, actorUserAccountId: input.envelope.actorSession.userAccountId,
    action: input.action, targetType: "DISCIPLINE_RECORD", targetId: input.recordId,
    beforeJson: input.before, afterJson: input.after, createdAt: input.now,
  });
  await transaction.insert(disciplineOutbox).values({
    id: randomUUID(), requestId: input.envelope.requestId, aggregateId: input.recordId,
    aggregateRevision: input.revision, eventType: input.action,
    dedupeKey: `${input.recordId}:${input.revision}:${input.action}`, payloadJson: { id: input.recordId, revision: input.revision, active: input.after.active }, createdAt: input.now,
  });
  return body;
}

export class PostgresDisciplineAdapter implements
  DisciplineUnitOfWork,
  DisciplineAuthorizationPort,
  DisciplineRepository,
  DisciplineReceiptPort,
  DisciplineQueryPort,
  DisciplineAdminCommandPort,
  PrivateAssetUnitOfWork,
  PrivateAssetAuthorizationPort,
  PrivateAssetRepository {
  private readonly disciplineTransactions = new WeakMap<DisciplineTransaction, V2Transaction>();
  private readonly assetTransactions = new WeakMap<PrivateAssetTransaction, V2Transaction>();

  constructor(private readonly database: V2Database) {}

  transaction<T>(operation: (transaction: DisciplineTransaction) => Promise<T>): Promise<T>;
  transaction<T>(operation: (transaction: PrivateAssetTransaction) => Promise<T>): Promise<T>;
  transaction<T>(operation: ((transaction: DisciplineTransaction) => Promise<T>) | ((transaction: PrivateAssetTransaction) => Promise<T>)): Promise<T> {
    return withTransaction(this.database, async (transaction) => {
      const context = { transactionId: randomUUID() } as PrivateAssetTransaction & DisciplineTransaction;
      this.disciplineTransactions.set(context, transaction);
      this.assetTransactions.set(context, transaction);
      try { return await operation(context); }
      finally { this.disciplineTransactions.delete(context); this.assetTransactions.delete(context); }
    });
  }

  private disciplineTransaction(context: DisciplineTransaction) {
    const transaction = this.disciplineTransactions.get(context);
    if (!transaction) throw new Error("Discipline transaction is inactive.");
    return transaction;
  }

  private assetTransaction(context: PrivateAssetTransaction) {
    const transaction = this.assetTransactions.get(context);
    if (!transaction) throw new Error("Private asset transaction is inactive.");
    return transaction;
  }

  recheck(
    transactionContext: DisciplineTransaction,
    input: Parameters<DisciplineAuthorizationPort["recheck"]>[1],
  ): Promise<CurrentDisciplineActor | null>;
  recheck<TActor extends PrivateAssetActor>(
    transactionContext: PrivateAssetTransaction,
    input: TActor,
  ): Promise<TActor | null>;
  async recheck(transactionContext: DisciplineTransaction | PrivateAssetTransaction, input: Parameters<DisciplineAuthorizationPort["recheck"]>[1] | PrivateAssetActor): Promise<CurrentDisciplineActor | PrivateAssetActor | null> {
    const transaction = this.disciplineTransactions.get(transactionContext as DisciplineTransaction) ?? this.assetTransactions.get(transactionContext as PrivateAssetTransaction);
    if (!transaction) throw new Error("Authorization transaction is inactive.");
    if ("authorizationIntent" in input) {
      const intent = input.authorizationIntent;
      const actorSession = {
        userAccountId: input.principalId,
        sessionId: intent.sessionId,
        role: intent.kind === "ACCOUNT_SESSION" ? intent.role : intent.minimumRole,
        authVersion: intent.authVersion,
      };
      const policy = intent.kind === "ACCOUNT_SESSION" ? APPROVED_ACCOUNT_MUTATION_SESSION_POLICY : {
        ...ADMIN_MUTATION_SESSION_POLICY, minimumRole: intent.minimumRole,
      };
      const locked = await lockTransactionSessionActor(transaction, actorSession, new Date(), policy);
      if (!locked) return null;
      if (intent.kind === "ADMIN_TOTP") return { purpose: "ADMIN", principalId: locked.id, userAccountId: locked.id, role: locked.role as "ADMIN" | "SUPER_ADMIN" };
      const player = (await transaction.select({ id: players.id }).from(players).where(eq(players.userAccountId, locked.id)).limit(1))[0];
      return { purpose: "ACCOUNT", principalId: locked.id, userAccountId: locked.id, playerId: player?.id ?? null };
    }
    if (input.purpose === "JOB") {
      return ["DISCIPLINE_ASSET_CLEANUP", "DISCIPLINE_ASSET_RECOVERY"].includes(input.principalId)
        ? input
        : null;
    }
    const actorSession = { userAccountId: input.userAccountId, sessionId: input.sessionId, role: input.role, authVersion: input.authVersion };
    const policy = input.purpose === "ADMIN" ? { ...ADMIN_MUTATION_SESSION_POLICY, minimumRole: input.role } : APPROVED_ACCOUNT_MUTATION_SESSION_POLICY;
    const locked = await lockTransactionSessionActor(transaction, actorSession, new Date(), policy);
    return locked ? input : null;
  }

  async claim(context: DisciplineTransaction, command: DisciplineCommand): Promise<DisciplineReceiptClaim> {
    const transaction = this.disciplineTransaction(context);
    const key = Buffer.from(command.metadata.idempotency.keyHash);
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${command.metadata.principalId}:${command.metadata.idempotency.scope}:${key.toString("hex")}`}, 0))`);
    const row = (await transaction.select().from(disciplineCommandReceipts).where(and(
      eq(disciplineCommandReceipts.principalId, command.metadata.principalId),
      eq(disciplineCommandReceipts.scope, command.metadata.idempotency.scope),
      eq(disciplineCommandReceipts.keyHash, key),
      sql<boolean>`${disciplineCommandReceipts.expiresAt} > clock_timestamp()`,
    )).limit(1))[0];
    if (!row) return { kind: "CLAIMED" };
    if (!sameBytes(row.requestHash, command.metadata.idempotency.requestHash) || row.bodyDigestHex !== command.metadata.idempotency.bodyDigestHex) return { kind: "MISMATCH" };
    const receipt = receiptBody(row);
    if (!receipt) throw new Error("Stored discipline receipt is invalid.");
    return { kind: "REPLAY", receipt };
  }

  async complete(context: DisciplineTransaction, receipt: DisciplineCommandReceipt) {
    const transaction = this.disciplineTransaction(context);
    await transaction.insert(disciplineCommandReceipts).values({
      id: randomUUID(), principalId: receipt.principalId, actorUserAccountId: receipt.principalId,
      scope: receipt.scope, keyHash: Buffer.from(receipt.keyHash), requestHash: Buffer.from(receipt.requestHash),
      bodyDigestHex: receipt.bodyDigestHex, responseStatus: 200, responseJson: receipt.body,
      responseEtag: `"${receipt.body.revision}"`, createdAt: new Date(receipt.createdAt), expiresAt: new Date(receipt.expiresAt),
    });
  }

  async loadTaskForUpdate(context: DisciplineTransaction, taskId: string): Promise<DisciplineTask | null> {
    const transaction = this.disciplineTransaction(context);
    const row = (await transaction.select().from(disciplineResolutionTasks).where(eq(disciplineResolutionTasks.id, taskId)).for("update").limit(1))[0];
    if (!row) return null;
    const evidenceRows = await transaction.select({ id: disciplineEvidence.privateAssetId, sha256: privateAssets.sha256, submittedAt: disciplineEvidence.submittedAt, supersededAt: disciplineEvidence.supersededAt })
      .from(disciplineEvidence).innerJoin(privateAssets, eq(privateAssets.id, disciplineEvidence.privateAssetId))
      .where(eq(disciplineEvidence.taskId, taskId)).orderBy(asc(disciplineEvidence.submittedAt), asc(disciplineEvidence.id));
    return {
      id: row.id, revision: row.revision, ownerAccountId: row.ownerUserAccountId, ownerPlayerId: row.ownerPlayerId,
      requiredGameCount: row.requiredGameCount, dueAt: row.dueAt, status: row.status, reviewNote: row.reviewNote,
      reviewBoundaryAt: row.reviewBoundaryAt,
      evidence: evidenceRows.map((item): DomainEvidence => ({ id: item.id, sha256Hex: Buffer.from(item.sha256).toString("hex"), submittedAt: item.submittedAt, supersededAt: item.supersededAt })),
    };
  }

  async loadReadyEvidenceAssetForUpdate(context: DisciplineTransaction, input: { assetId: string; taskId: string; userAccountId: string }): Promise<ReadyDisciplineEvidenceAsset | null> {
    const transaction = this.disciplineTransaction(context);
    const row = (await transaction.select({ id: privateAssets.id, sha256: privateAssets.sha256, readyAt: privateAssets.readyAt })
      .from(privateAssets).innerJoin(disciplineAssetBindings, eq(disciplineAssetBindings.privateAssetId, privateAssets.id))
      .where(and(eq(privateAssets.id, input.assetId), eq(privateAssets.status, "READY"), eq(privateAssets.purpose, "DISCIPLINE_RESOLUTION"), eq(disciplineAssetBindings.taskId, input.taskId), eq(disciplineAssetBindings.ownerUserAccountId, input.userAccountId)))
      .for("update").limit(1))[0];
    return row?.readyAt ? { id: row.id, sha256Hex: Buffer.from(row.sha256).toString("hex"), readyAt: row.readyAt } : null;
  }

  async saveTask(context: DisciplineTransaction, input: { task: DisciplineTask; expectedRevision: number; actor: CurrentDisciplineActor }) {
    const transaction = this.disciplineTransaction(context);
    const taskRow = (await transaction.select({ recordId: disciplineResolutionTasks.disciplineRecordId }).from(disciplineResolutionTasks).where(eq(disciplineResolutionTasks.id, input.task.id)).limit(1))[0];
    if (!taskRow) throw new DisciplineApplicationError("NOT_FOUND", "Discipline task is not available.");
    const reviewed = ["APPROVED", "REJECTED", "CANCELLED"].includes(input.task.status);
    const updated = await transaction.update(disciplineResolutionTasks).set({
      revision: input.task.revision, status: input.task.status, reviewNote: input.task.reviewNote,
      reviewBoundaryAt: input.task.reviewBoundaryAt,
      reviewedByUserAccountId: reviewed && input.actor.purpose === "ADMIN" ? input.actor.userAccountId : null,
      reviewedAt: reviewed ? new Date() : null,
      updatedAt: new Date(),
    }).where(and(eq(disciplineResolutionTasks.id, input.task.id), eq(disciplineResolutionTasks.revision, input.expectedRevision))).returning({ id: disciplineResolutionTasks.id });
    if (updated.length !== 1) throw new DisciplineApplicationError("INVALID_COMMAND", "STALE_TASK_REVISION");
    const currentIds = new Set((await transaction.select({ id: disciplineEvidence.privateAssetId }).from(disciplineEvidence).where(eq(disciplineEvidence.taskId, input.task.id))).map((row) => row.id));
    const added = input.task.evidence.filter((item) => !currentIds.has(item.id));
    if (added.length > 0) await transaction.insert(disciplineEvidence).values(added.map((item) => ({ id: randomUUID(), taskId: input.task.id, privateAssetId: item.id, submittedAt: item.submittedAt, supersededAt: item.supersededAt })));
    if (input.task.status === "REJECTED" && input.task.reviewBoundaryAt) await transaction.update(disciplineEvidence).set({ supersededAt: input.task.reviewBoundaryAt }).where(and(eq(disciplineEvidence.taskId, input.task.id), isNull(disciplineEvidence.supersededAt), sql<boolean>`${disciplineEvidence.submittedAt} <= ${input.task.reviewBoundaryAt}`));
    if (input.task.status === "APPROVED") await transaction.update(disciplineRecords).set({ active: false, resetAt: new Date(), resetReason: "RESOLUTION_APPROVED", revision: sql`${disciplineRecords.revision} + 1`, updatedAt: new Date() }).where(and(eq(disciplineRecords.id, taskRow.recordId), eq(disciplineRecords.active, true)));
  }

  auditPort(): DisciplineAuditPort {
    return { append: async (context, event) => this.appendDisciplineAudit(context, event) };
  }

  outboxPort(): DisciplineOutboxPort {
    return { append: async (context, event) => this.appendDisciplineOutbox(context, event) };
  }

  private async appendDisciplineAudit(context: DisciplineTransaction, event: DisciplineAuditEvent) {
    await this.disciplineTransaction(context).insert(auditEvents).values({ requestId: event.requestId, actorUserAccountId: event.actorPrincipalId, action: event.action, targetType: "DISCIPLINE_TASK", targetId: event.targetId, beforeJson: event.before, afterJson: event.after, createdAt: new Date(event.occurredAt) });
  }

  private async appendDisciplineOutbox(context: DisciplineTransaction, event: DisciplineOutboxEvent) {
    await this.disciplineTransaction(context).insert(disciplineOutbox).values({ id: randomUUID(), requestId: event.requestId, aggregateId: event.aggregateId, aggregateRevision: event.aggregateRevision, eventType: event.eventType, dedupeKey: event.dedupeKey, payloadJson: event.payload, createdAt: new Date(event.occurredAt) });
  }

  async getPublicStatistics() {
    const rows = await this.database.select({ id: disciplineRecords.id, type: disciplineRecords.type, active: disciplineRecords.active, createdAt: disciplineRecords.createdAt }).from(disciplineRecords);
    return buildPublicDisciplineStatistics(rows);
  }

  async listOwnerTasks(userAccountId: string) {
    const linked = sql<boolean>`exists (select 1 from "registry"."players" p where p."id" = ${disciplineResolutionTasks.ownerPlayerId} and p."user_account_id" = ${userAccountId})`;
    const rows = await this.database.select().from(disciplineResolutionTasks).where(or(eq(disciplineResolutionTasks.ownerUserAccountId, userAccountId), linked)).orderBy(desc(disciplineResolutionTasks.dueAt), desc(disciplineResolutionTasks.id)).limit(100);
    return Promise.all(rows.map((row) => ownerTaskDto(this.database, row)));
  }

  async getOwnerTask(userAccountId: string, taskId: string) {
    const linked = sql<boolean>`exists (select 1 from "registry"."players" p where p."id" = ${disciplineResolutionTasks.ownerPlayerId} and p."user_account_id" = ${userAccountId})`;
    const row = (await this.database.select().from(disciplineResolutionTasks).where(and(eq(disciplineResolutionTasks.id, taskId), or(eq(disciplineResolutionTasks.ownerUserAccountId, userAccountId), linked))).limit(1))[0];
    return row ? ownerTaskDto(this.database, row) : null;
  }

  async listAdmin(query: DisciplineAdminListQuery) {
    const taskFilter = query.tab === "tasks" ? sql<boolean>`exists (select 1 from "discipline"."resolution_tasks" t where t."discipline_record_id" = ${disciplineRecords.id}${query.status ? sql` and t."status" = ${query.status}` : sql``})` : undefined;
    const reviewFilter = query.tab === "reviews" ? sql<boolean>`exists (select 1 from "discipline"."resolution_tasks" t where t."discipline_record_id" = ${disciplineRecords.id} and t."status" = 'PENDING_REVIEW')` : undefined;
    const activeFilter = query.active === undefined ? undefined : eq(disciplineRecords.active, query.active);
    const where = and(taskFilter, reviewFilter, activeFilter);
    const [rows, total] = await Promise.all([
      this.database.select().from(disciplineRecords).where(where).orderBy(desc(disciplineRecords.createdAt), desc(disciplineRecords.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
      this.database.select({ value: count() }).from(disciplineRecords).where(where),
    ]);
    return { items: await Promise.all(rows.map((row) => adminRecordDto(this.database, row))), totalCount: total[0]?.value ?? 0 };
  }

  async getAdminRecord(id: string) {
    const row = (await this.database.select().from(disciplineRecords).where(eq(disciplineRecords.id, id)).limit(1))[0];
    return row ? adminRecordDto(this.database, row) : null;
  }

  async claimSignedAssetJob(input: Readonly<{ jobName: "cleanup" | "recover"; nonce: string; bodyDigestHex: string; requestId: string; now: Date }>) {
    const principalId = `DISCIPLINE_ASSET_${input.jobName.toUpperCase()}`;
    const scope = `job:discipline-assets:${input.jobName}`;
    const keyHash = createHash("sha256").update(`klol-v2:${scope}\0${input.nonce}`).digest();
    const requestHash = Buffer.from(input.bodyDigestHex, "hex");
    return withTransaction(this.database, async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${principalId}:${input.nonce}`}, 0))`);
      const existing = (await transaction.select({ requestHash: disciplineCommandReceipts.requestHash }).from(disciplineCommandReceipts).where(and(eq(disciplineCommandReceipts.principalId, principalId), eq(disciplineCommandReceipts.scope, scope), eq(disciplineCommandReceipts.keyHash, keyHash))).limit(1))[0];
      if (existing) {
        if (!sameBytes(existing.requestHash, requestHash)) throw new DisciplineApplicationError("IDEMPOTENCY_MISMATCH", "Job nonce was used with a different body.");
        return false;
      }
      await transaction.insert(disciplineCommandReceipts).values({ id: randomUUID(), principalId, scope, keyHash, requestHash, bodyDigestHex: input.bodyDigestHex, responseStatus: 202, responseJson: { accepted: true }, responseEtag: `"0"`, createdAt: input.now, expiresAt: new Date(input.now.getTime() + RECEIPT_TTL_MS) });
      await transaction.insert(auditEvents).values({ requestId: input.requestId, action: `DISCIPLINE_ASSET_JOB_${input.jobName.toUpperCase()}_ACCEPTED`, targetType: "DISCIPLINE_ASSET_JOB", targetId: input.nonce, metadataJson: { jobName: input.jobName }, createdAt: input.now });
      await transaction.insert(disciplineOutbox).values({ id: randomUUID(), requestId: input.requestId, aggregateId: input.requestId, aggregateRevision: 0, eventType: `DISCIPLINE_ASSET_JOB_${input.jobName.toUpperCase()}_ACCEPTED`, dedupeKey: `${scope}:${input.nonce}`, payloadJson: { jobName: input.jobName }, createdAt: input.now });
      return true;
    });
  }

  async createRecord(envelope: DisciplineMutationEnvelope, input: CreateDisciplineRecordInput, now: Date) {
    return withTransaction(this.database, async (transaction) => {
      const actor = await lockTransactionSessionActor(transaction, envelope.actorSession, now, ADMIN_MUTATION_SESSION_POLICY);
      if (!actor) throw new DisciplineApplicationError("INVALID_AUTHORIZATION", "Administrator session is stale.");
      const lockKey = `${actor.id}:${envelope.scope}:${envelope.keyHash.toString("hex")}`;
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const replay = await existingAdminReceipt(transaction, envelope);
      if (replay) return replay;
      const normalized = {
        ...input,
        targetName: cleanText(input.targetName, 100, "INVALID_TARGET_NAME"),
        targetNickname: cleanOptionalText(input.targetNickname, 64, "INVALID_TARGET_NICKNAME"),
        targetTagLine: cleanOptionalText(input.targetTagLine, 32, "INVALID_TARGET_TAG"),
        source: cleanText(input.source, 64, "INVALID_SOURCE"),
        reason: cleanText(input.reason, 1000, "INVALID_REASON"),
        internalNote: cleanOptionalText(input.internalNote, 2000, "INVALID_NOTE"),
      };
      let userAccountId = normalized.userAccountId;
      let playerId = normalized.playerId;
      if (userAccountId) {
        const user = (await transaction.select({ id: userAccounts.id }).from(userAccounts).where(and(eq(userAccounts.id, userAccountId), isNull(userAccounts.deletedAt))).limit(1))[0];
        if (!user) throw new DisciplineApplicationError("NOT_FOUND", "Target is not available.");
        playerId ??= (await transaction.select({ id: players.id }).from(players).where(eq(players.userAccountId, userAccountId)).limit(1))[0]?.id ?? null;
      }
      if (playerId) {
        const player = (await transaction.select({ id: players.id, userAccountId: players.userAccountId }).from(players).where(eq(players.id, playerId)).limit(1))[0];
        if (!player) throw new DisciplineApplicationError("NOT_FOUND", "Target is not available.");
        userAccountId ??= player.userAccountId;
      }
      const identityKey = disciplineIdentityKey({ userAccountId, playerId, directName: normalized.targetName, directNickname: normalized.targetNickname, directTagLine: normalized.targetTagLine });
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identityKey}, 0))`);
      const recordId = randomUUID();
      await transaction.insert(disciplineRecords).values({ id: recordId, identityKey, userAccountId, playerId, targetName: normalized.targetName, targetNickname: normalized.targetNickname, targetTagLine: normalized.targetTagLine, type: normalized.type, category: normalized.category, source: normalized.source, reason: normalized.reason, internalNote: normalized.internalNote, createdByUserAccountId: actor.id, createdAt: now, updatedAt: now });
      if (normalized.type === "WARNING" && (userAccountId || playerId)) await this.insertResolutionTask(transaction, recordId, userAccountId, playerId, normalized.category, now);
      if (normalized.type === "CAUTION") await this.convertCautionsIfNeeded(transaction, identityKey, { userAccountId, playerId, targetName: normalized.targetName, targetNickname: normalized.targetNickname, targetTagLine: normalized.targetTagLine }, actor.id, now);
      if (normalized.type === "WARNING") await this.ensureBanReview(transaction, identityKey, now);
      const row = (await transaction.select().from(disciplineRecords).where(eq(disciplineRecords.id, recordId)).limit(1))[0]!;
      const dto = await adminRecordDto(transaction, row);
      const body = await writeAdminEvidence(transaction, { envelope, action: "DISCIPLINE_RECORD_CREATED", recordId, revision: 0, before: null, after: dto as unknown as Record<string, unknown>, status: 201, now });
      return { body, status: 201, revision: 0, replayed: false };
    });
  }

  async updateRecord(envelope: DisciplineMutationEnvelope, id: string, expectedRevision: number, input: UpdateDisciplineRecordInput, now: Date) {
    return this.mutateRecord(envelope, id, expectedRevision, now, "DISCIPLINE_RECORD_UPDATED", async (transaction, current) => {
      const reason = cleanText(input.reason, 1000, "INVALID_REASON");
      const internalNote = cleanOptionalText(input.internalNote, 2000, "INVALID_NOTE");
      const rows = await transaction.update(disciplineRecords).set({ reason, internalNote, revision: current.revision + 1, updatedAt: now }).where(and(eq(disciplineRecords.id, id), eq(disciplineRecords.revision, expectedRevision))).returning();
      return rows[0]!;
    });
  }

  async cancelRecord(envelope: DisciplineMutationEnvelope, id: string, expectedRevision: number, reason: string, now: Date) {
    return this.mutateRecord(envelope, id, expectedRevision, now, "DISCIPLINE_RECORD_CANCELLED", async (transaction, current, actorId) => {
      if (!current.active) throw new DisciplineApplicationError("INVALID_COMMAND", "Record is already inactive.");
      const resetReason = cleanText(reason, 1000, "INVALID_RESET_REASON");
      const rows = await transaction.update(disciplineRecords).set({ active: false, resetReason, resetAt: now, resetByUserAccountId: actorId, revision: current.revision + 1, updatedAt: now }).where(and(eq(disciplineRecords.id, id), eq(disciplineRecords.revision, expectedRevision))).returning();
      await transaction.update(disciplineResolutionTasks).set({ status: "CANCELLED", reviewNote: resetReason, reviewedByUserAccountId: actorId, reviewedAt: now, revision: sql`${disciplineResolutionTasks.revision} + 1`, updatedAt: now }).where(and(eq(disciplineResolutionTasks.disciplineRecordId, id), inArray(disciplineResolutionTasks.status, ["REQUIRED", "AWAITING_UPLOAD", "PENDING_REVIEW", "REJECTED"])));
      return rows[0]!;
    });
  }

  private async mutateRecord(envelope: DisciplineMutationEnvelope, id: string, expectedRevision: number, now: Date, action: string, change: (transaction: V2Transaction, row: RecordRow, actorId: string) => Promise<RecordRow>) {
    return withTransaction(this.database, async (transaction) => {
      const actor = await lockTransactionSessionActor(transaction, envelope.actorSession, now, ADMIN_MUTATION_SESSION_POLICY);
      if (!actor) throw new DisciplineApplicationError("INVALID_AUTHORIZATION", "Administrator session is stale.");
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${actor.id}:${envelope.scope}:${envelope.keyHash.toString("hex")}`}, 0))`);
      const replay = await existingAdminReceipt(transaction, envelope);
      if (replay) return replay;
      const current = (await transaction.select().from(disciplineRecords).where(eq(disciplineRecords.id, id)).for("update").limit(1))[0];
      if (!current) throw new DisciplineApplicationError("NOT_FOUND", "Discipline record is not available.");
      if (current.revision !== expectedRevision) throw new DisciplineApplicationError("INVALID_COMMAND", "STALE_RECORD_REVISION");
      const next = await change(transaction, current, actor.id);
      const dto = await adminRecordDto(transaction, next);
      const body = await writeAdminEvidence(transaction, { envelope, action, recordId: id, revision: next.revision, before: (await adminRecordDto(transaction, current)) as unknown as Record<string, unknown>, after: dto as unknown as Record<string, unknown>, status: 200, now });
      return { body, status: 200, revision: next.revision, replayed: false };
    });
  }

  private async insertResolutionTask(transaction: V2Transaction, recordId: string, ownerUserAccountId: string | null, ownerPlayerId: string | null, category: "GENERAL" | "INHOUSE", now: Date) {
    await transaction.insert(disciplineResolutionTasks).values({ id: randomUUID(), publicCode: `WR-${randomUUID().replaceAll("-", "").slice(0, 16)}`, disciplineRecordId: recordId, ownerUserAccountId, ownerPlayerId, category, requiredGameCount: requiredResolutionGameCount(category), dueAt: disciplineResolutionDueAt(now), status: "REQUIRED", createdAt: now, updatedAt: now });
  }

  private async convertCautionsIfNeeded(transaction: V2Transaction, identityKey: string, target: { userAccountId: string | null; playerId: string | null; targetName: string; targetNickname: string | null; targetTagLine: string | null }, actorId: string, now: Date) {
    const cautions = await transaction.select({ id: disciplineRecords.id, identityKey: disciplineRecords.identityKey, type: disciplineRecords.type, active: disciplineRecords.active, createdAt: disciplineRecords.createdAt }).from(disciplineRecords)
      .where(and(eq(disciplineRecords.identityKey, identityKey), eq(disciplineRecords.type, "CAUTION"), eq(disciplineRecords.active, true), sql<boolean>`not exists (select 1 from "discipline"."caution_conversions" c where c."caution_record_id" = ${disciplineRecords.id})`))
      .orderBy(asc(disciplineRecords.createdAt), asc(disciplineRecords.id)).for("update");
    const plan = planCautionConversion(cautions.map((item) => ({ ...item, convertedToWarningId: null })), identityKey);
    if (!plan) return;
    const warningId = randomUUID();
    await transaction.insert(disciplineRecords).values({ id: warningId, identityKey, ...target, type: "WARNING", category: "GENERAL", source: "CAUTION_CONVERSION", reason: "주의 3회 누적에 따른 자동 경고 전환", createdByUserAccountId: actorId, createdAt: now, updatedAt: now });
    await transaction.update(disciplineRecords).set({ active: false, resetReason: "CAUTION_CONVERTED", resetAt: now, resetByUserAccountId: actorId, revision: sql`${disciplineRecords.revision} + 1`, updatedAt: now }).where(inArray(disciplineRecords.id, [...plan.cautionRecordIds]));
    await transaction.insert(disciplineCautionConversions).values(plan.cautionRecordIds.map((cautionRecordId) => ({ cautionRecordId, warningRecordId: warningId, createdAt: now })));
    if (target.userAccountId || target.playerId) await this.insertResolutionTask(transaction, warningId, target.userAccountId, target.playerId, "GENERAL", now);
    await this.ensureBanReview(transaction, identityKey, now);
  }

  private async ensureBanReview(transaction: V2Transaction, identityKey: string, now: Date) {
    const warnings = await transaction.select({ id: disciplineRecords.id, identityKey: disciplineRecords.identityKey, type: disciplineRecords.type, active: disciplineRecords.active, createdAt: disciplineRecords.createdAt }).from(disciplineRecords).where(and(eq(disciplineRecords.identityKey, identityKey), eq(disciplineRecords.type, "WARNING"), eq(disciplineRecords.active, true))).orderBy(asc(disciplineRecords.createdAt), asc(disciplineRecords.id)).for("update");
    const existing = (await transaction.select({ id: disciplineBanReviews.id }).from(disciplineBanReviews).where(and(eq(disciplineBanReviews.identityKey, identityKey), eq(disciplineBanReviews.status, "PENDING"))).limit(1))[0];
    const plan = planBanReview(warnings.map((item) => ({ ...item, convertedToWarningId: null })), identityKey, Boolean(existing));
    if (plan) await transaction.insert(disciplineBanReviews).values({ id: randomUUID(), identityKey, warningRecordIdsJson: [...plan.warningRecordIds], status: "PENDING", createdAt: now, updatedAt: now });
  }

  async resolveResourceForUpdate(context: PrivateAssetTransaction, resource: { resourceType: string; resourceId: string }): Promise<PrivateAssetResourceBinding | null> {
    if (resource.resourceType !== "DISCIPLINE_TASK") return null;
    const row = (await this.assetTransaction(context).select({
      id: disciplineResolutionTasks.id,
      ownerUserAccountId: disciplineResolutionTasks.ownerUserAccountId,
      linkedUserAccountId: players.userAccountId,
    }).from(disciplineResolutionTasks)
      .leftJoin(players, eq(players.id, disciplineResolutionTasks.ownerPlayerId))
      .where(and(
        eq(disciplineResolutionTasks.id, resource.resourceId),
        inArray(disciplineResolutionTasks.status, ["REQUIRED", "AWAITING_UPLOAD", "REJECTED"]),
        sql<boolean>`${disciplineResolutionTasks.dueAt} > clock_timestamp()`,
      )).for("update").limit(1))[0];
    return row ? { resourceType: "DISCIPLINE_TASK", resourceId: row.id, ownerUserAccountId: row.ownerUserAccountId ?? row.linkedUserAccountId, public: false } : null;
  }

  async findDuplicateForUpdate(context: PrivateAssetTransaction, input: { resourceType: string; resourceId: string; purpose: PrivateAssetPurpose; sha256: Uint8Array }) {
    if (input.resourceType !== "DISCIPLINE_TASK") return null;
    const row = (await this.assetTransaction(context).select({ asset: privateAssets, binding: disciplineAssetBindings }).from(disciplineAssetBindings).innerJoin(privateAssets, eq(privateAssets.id, disciplineAssetBindings.privateAssetId)).where(and(eq(disciplineAssetBindings.taskId, input.resourceId), eq(privateAssets.purpose, input.purpose), eq(privateAssets.sha256, Buffer.from(input.sha256)))).for("update").limit(1))[0];
    return row ? this.assetBinding(row.asset, row.binding) : null;
  }

  async insertStaged(context: PrivateAssetTransaction, binding: PrivateAssetBinding) {
    const transaction = this.assetTransaction(context);
    await transaction.insert(privateAssets).values({ id: binding.asset.id, createdByUserAccountId: binding.asset.createdByUserAccountId, ingestSource: binding.asset.ingestSource, storageProvider: binding.asset.storageProvider, storageKey: binding.asset.storageKey, originalFileName: binding.asset.originalFileName, contentType: binding.asset.contentType, byteSize: binding.asset.byteSize, width: binding.asset.width, height: binding.asset.height, sha256: Buffer.from(binding.asset.sha256), purpose: binding.asset.purpose, status: binding.asset.status, readyAt: binding.asset.readyAt ? new Date(binding.asset.readyAt) : null, deleteRequestedAt: binding.asset.deleteRequestedAt ? new Date(binding.asset.deleteRequestedAt) : null, createdAt: new Date(binding.asset.createdAt) });
    await transaction.insert(disciplineAssetBindings).values({ privateAssetId: binding.asset.id, taskId: binding.resourceId, ownerUserAccountId: binding.ownerUserAccountId, createdAt: new Date(binding.asset.createdAt) });
  }

  async findByIdForUpdate(context: PrivateAssetTransaction, assetId: string) {
    const row = (await this.assetTransaction(context).select({ asset: privateAssets, binding: disciplineAssetBindings }).from(disciplineAssetBindings).innerJoin(privateAssets, eq(privateAssets.id, disciplineAssetBindings.privateAssetId)).where(eq(privateAssets.id, assetId)).for("update").limit(1))[0];
    return row ? this.assetBinding(row.asset, row.binding) : null;
  }

  async updateLifecycle(context: PrivateAssetTransaction, asset: PrivateAssetRecord) {
    await this.assetTransaction(context).update(privateAssets).set({ status: asset.status, readyAt: asset.readyAt ? new Date(asset.readyAt) : null, deleteRequestedAt: asset.deleteRequestedAt ? new Date(asset.deleteRequestedAt) : null }).where(eq(privateAssets.id, asset.id));
  }

  async list(context: PrivateAssetTransaction, query: PrivateAssetListQuery, allowedPurposes: readonly PrivateAssetPurpose[]) {
    const where = and(
      inArray(privateAssets.purpose, [...allowedPurposes]),
      query.purpose ? eq(privateAssets.purpose, query.purpose) : undefined,
      query.status ? eq(privateAssets.status, query.status) : undefined,
      query.resourceType && query.resourceType !== "DISCIPLINE_TASK" ? sql<boolean>`false` : undefined,
      query.resourceId ? eq(disciplineAssetBindings.taskId, query.resourceId) : undefined,
      query.createdByUserAccountId ? eq(privateAssets.createdByUserAccountId, query.createdByUserAccountId) : undefined,
    );
    const rows = await this.assetTransaction(context).select({ asset: privateAssets, binding: disciplineAssetBindings }).from(disciplineAssetBindings).innerJoin(privateAssets, eq(privateAssets.id, disciplineAssetBindings.privateAssetId)).where(where).orderBy(desc(privateAssets.createdAt), desc(privateAssets.id)).limit(query.pageSize + 1);
    return { items: rows.slice(0, query.pageSize).map((row) => this.assetBinding(row.asset, row.binding)), nextCursor: rows.length > query.pageSize ? Buffer.from(JSON.stringify([rows[query.pageSize - 1]!.asset.createdAt.toISOString(), rows[query.pageSize - 1]!.asset.id])).toString("base64url") : null };
  }

  async listCleanupCandidates(context: PrivateAssetTransaction, limit: number) {
    const rows = await this.assetTransaction(context).select({ asset: privateAssets }).from(disciplineAssetBindings).innerJoin(privateAssets, eq(privateAssets.id, disciplineAssetBindings.privateAssetId)).where(and(eq(privateAssets.status, "DELETE_PENDING"), sql<boolean>`not exists (select 1 from "discipline"."asset_cleanup_outcomes" o where o."private_asset_id" = ${privateAssets.id} and o."succeeded" = true)`)).orderBy(asc(privateAssets.deleteRequestedAt), asc(privateAssets.id)).limit(limit).for("update", { skipLocked: true });
    return rows.map((row) => assetRecord(row.asset)).filter((row): row is PrivateAssetRecord => row !== null);
  }

  async listStaleStagedCandidates(context: PrivateAssetTransaction, before: string, limit: number) {
    const rows = await this.assetTransaction(context).select({ asset: privateAssets, binding: disciplineAssetBindings }).from(disciplineAssetBindings).innerJoin(privateAssets, eq(privateAssets.id, disciplineAssetBindings.privateAssetId)).where(and(eq(privateAssets.status, "STAGED"), lt(privateAssets.createdAt, new Date(before)))).orderBy(asc(privateAssets.createdAt), asc(privateAssets.id)).limit(limit).for("update", { skipLocked: true });
    return rows.map((row) => this.assetBinding(row.asset, row.binding));
  }

  async recordCleanupOutcome(context: PrivateAssetTransaction, outcome: { assetId: string; attemptedAt: string; succeeded: boolean; failureCode: "STORAGE_UNAVAILABLE" | null }) {
    await this.assetTransaction(context).insert(disciplineAssetCleanupOutcomes).values({ id: randomUUID(), privateAssetId: outcome.assetId, attemptedAt: new Date(outcome.attemptedAt), succeeded: outcome.succeeded, failureCode: outcome.failureCode });
  }

  assetAuditPort() {
    return { append: async (context: PrivateAssetTransaction, event: PrivateAssetAuditEvent) => {
      await this.assetTransaction(context).insert(auditEvents).values({ requestId: event.eventId, actorUserAccountId: event.actorUserAccountId, action: `PRIVATE_ASSET_${event.action}`, targetType: "PRIVATE_ASSET", targetId: event.assetId, metadataJson: { actorPurpose: event.actorPurpose, resourceType: event.resourceType, resourceId: event.resourceId, purpose: event.purpose, succeeded: event.succeeded }, createdAt: new Date(event.occurredAt) });
    } };
  }

  private assetBinding(assetRow: typeof privateAssets.$inferSelect, binding: typeof disciplineAssetBindings.$inferSelect): PrivateAssetBinding {
    const asset = assetRecord(assetRow);
    if (!asset) throw new Error("Stored private discipline asset is invalid.");
    return { asset, resourceType: "DISCIPLINE_TASK", resourceId: binding.taskId, ownerUserAccountId: binding.ownerUserAccountId, public: false };
  }
}
