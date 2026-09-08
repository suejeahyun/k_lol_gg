import type { JsonObject } from "@/modules/competitions/core";

import type { DisciplineTask } from "../domain/evidence-task";
import type { DisciplineCommand, DisciplineCommandAction } from "./commands";
import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";
import type { DisciplineCategory, DisciplineType } from "../domain/policy";
import type { PublicDisciplineStatisticsDto } from "../domain/public-statistics";

export interface DisciplineTransaction {
  readonly disciplineTransaction: unique symbol;
}

export interface DisciplineUnitOfWork {
  /** Authorization, receipt, task, audit and outbox writes share one rollback boundary. */
  transaction<T>(operation: (transaction: DisciplineTransaction) => Promise<T>): Promise<T>;
}

export type CurrentDisciplineActor =
  | Readonly<{
      purpose: "ACCOUNT";
      principalId: string;
      userAccountId: string;
      playerId: string | null;
    }>
  | Readonly<{
      purpose: "ADMIN";
      principalId: string;
      userAccountId: string;
      role: "ADMIN" | "SUPER_ADMIN";
    }>;

export interface DisciplineAuthorizationPort {
  /** Rechecks the live account/admin session and ADMIN-purpose TOTP inside the transaction. */
  recheck(
    transaction: DisciplineTransaction,
    input: Readonly<{
      principalId: string;
      action: DisciplineCommandAction;
      authorizationIntent: DisciplineCommand["metadata"]["authorizationIntent"];
    }>,
  ): Promise<CurrentDisciplineActor | null>;
}

export type ReadyDisciplineEvidenceAsset = Readonly<{
  id: string;
  sha256Hex: string;
  readyAt: Date;
}>;

export interface DisciplineRepository {
  loadTaskForUpdate(transaction: DisciplineTransaction, taskId: string): Promise<DisciplineTask | null>;
  /** Must return only a READY DISCIPLINE_RESOLUTION asset bound to this task and actor. */
  loadReadyEvidenceAssetForUpdate(
    transaction: DisciplineTransaction,
    input: Readonly<{ assetId: string; taskId: string; userAccountId: string }>,
  ): Promise<ReadyDisciplineEvidenceAsset | null>;
  saveTask(
    transaction: DisciplineTransaction,
    input: Readonly<{ task: DisciplineTask; expectedRevision: number; actor: CurrentDisciplineActor }>,
  ): Promise<void>;
}

export type DisciplineMutationBody = JsonObject & Readonly<{
  taskId: string;
  revision: number;
  status: DisciplineTask["status"];
  submittedEvidenceCount: number;
  requiredGameCount: number;
}>;

export type DisciplineCommandReceipt = Readonly<{
  principalId: string;
  scope: string;
  keyHash: Uint8Array;
  requestHash: Uint8Array;
  bodyDigestHex: string;
  body: DisciplineMutationBody;
  createdAt: string;
  expiresAt: string;
}>;

export type DisciplineReceiptClaim =
  | Readonly<{ kind: "CLAIMED" }>
  | Readonly<{ kind: "MISMATCH" }>
  | Readonly<{ kind: "REPLAY"; receipt: DisciplineCommandReceipt }>;

export interface DisciplineReceiptPort {
  claim(transaction: DisciplineTransaction, command: DisciplineCommand): Promise<DisciplineReceiptClaim>;
  complete(transaction: DisciplineTransaction, receipt: DisciplineCommandReceipt): Promise<void>;
}

export type DisciplineAuditEvent = Readonly<{
  requestId: string;
  actorPrincipalId: string;
  action: `DISCIPLINE_${DisciplineCommandAction}`;
  targetId: string;
  before: JsonObject;
  after: JsonObject;
  occurredAt: string;
}>;

export type DisciplineOutboxEvent = Readonly<{
  id: string;
  requestId: string;
  aggregateId: string;
  aggregateRevision: number;
  eventType: `DISCIPLINE_${DisciplineCommandAction}`;
  dedupeKey: string;
  payload: JsonObject;
  occurredAt: string;
}>;

export interface DisciplineAuditPort {
  append(transaction: DisciplineTransaction, event: DisciplineAuditEvent): Promise<void>;
}

export interface DisciplineOutboxPort {
  append(transaction: DisciplineTransaction, event: DisciplineOutboxEvent): Promise<void>;
}

export interface DisciplineClockPort {
  now(): Date;
  receiptExpiresAt(now: Date): Date;
}

export type DisciplineCommandResult = Readonly<{
  body: DisciplineMutationBody;
  revision: number;
  replayed: boolean;
}>;

export type DisciplineEvidenceDto = Readonly<{
  assetId: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  status: "STAGED" | "READY" | "DELETE_PENDING";
  submittedAt: string | null;
}>;

export type OwnerDisciplineTaskDto = Readonly<{
  id: string;
  publicCode: string;
  revision: number;
  category: DisciplineCategory;
  requiredGameCount: number;
  submittedEvidenceCount: number;
  remainingEvidenceCount: number;
  dueAt: string;
  status: DisciplineTask["status"];
  reviewNote: string | null;
  evidence: readonly DisciplineEvidenceDto[];
}>;

export type OwnerDisciplineRecordDto = Readonly<{
  id: string;
  type: DisciplineType;
  category: DisciplineCategory;
  reason: string;
  createdAt: string;
  taskId: string | null;
  taskStatus: DisciplineTask["status"] | null;
}>;

export type OwnerDisciplineOverviewDto = Readonly<{
  activeCounts: Readonly<Record<DisciplineType, number>>;
  records: readonly OwnerDisciplineRecordDto[];
  tasks: readonly OwnerDisciplineTaskDto[];
}>;

export type AdminDisciplineRecordDto = Readonly<{
  id: string;
  revision: number;
  userAccountId: string | null;
  playerId: string | null;
  targetName: string;
  targetNickname: string | null;
  targetTagLine: string | null;
  type: DisciplineType;
  category: DisciplineCategory;
  source: string;
  reason: string;
  internalNote: string | null;
  active: boolean;
  createdAt: string;
  task: OwnerDisciplineTaskDto | null;
}>;

export type DisciplineAdminListQuery = Readonly<{
  page: number;
  pageSize: number;
  tab: "records" | "tasks" | "reviews";
  status?: DisciplineTask["status"];
  active?: boolean;
}>;

export type DisciplineMutationEnvelope = Readonly<{
  actorSession: TransactionSessionActor;
  requestId: string;
  scope: string;
  keyHash: Buffer;
  requestHash: Buffer;
}>;

export type CreateDisciplineRecordInput = Readonly<{
  userAccountId: string | null;
  playerId: string | null;
  targetName: string;
  targetNickname: string | null;
  targetTagLine: string | null;
  type: DisciplineType;
  category: DisciplineCategory;
  source: string;
  reason: string;
  internalNote: string | null;
}>;

export type UpdateDisciplineRecordInput = Readonly<{
  reason: string;
  internalNote: string | null;
}>;

export type DisciplineAdminMutationResult = Readonly<{
  body: Record<string, unknown>;
  status: number;
  revision: number;
  replayed: boolean;
}>;

export interface DisciplineQueryPort {
  getPublicStatistics(): Promise<PublicDisciplineStatisticsDto>;
  listOwnerTasks(userAccountId: string): Promise<readonly OwnerDisciplineTaskDto[]>;
  getOwnerOverview(userAccountId: string): Promise<OwnerDisciplineOverviewDto>;
  getOwnerTask(userAccountId: string, taskId: string): Promise<OwnerDisciplineTaskDto | null>;
  listAdmin(query: DisciplineAdminListQuery): Promise<Readonly<{ items: readonly AdminDisciplineRecordDto[]; totalCount: number }>>;
  getAdminRecord(id: string): Promise<AdminDisciplineRecordDto | null>;
}

export interface DisciplineAdminCommandPort {
  createRecord(envelope: DisciplineMutationEnvelope, input: CreateDisciplineRecordInput, now: Date): Promise<DisciplineAdminMutationResult>;
  updateRecord(envelope: DisciplineMutationEnvelope, id: string, expectedRevision: number, input: UpdateDisciplineRecordInput, now: Date): Promise<DisciplineAdminMutationResult>;
  cancelRecord(envelope: DisciplineMutationEnvelope, id: string, expectedRevision: number, reason: string, now: Date): Promise<DisciplineAdminMutationResult>;
}
