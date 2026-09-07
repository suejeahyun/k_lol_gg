import type { JsonObject } from "@/modules/competitions/core";

import type { RecruitParty, ScrimRecruit } from "../domain/recruiting";
import type { RecruitingCommand, RecruitingCommandActor } from "./commands";

export interface RecruitingTransactionContext {
  readonly recruitingTransaction: unique symbol;
}

export interface RecruitingUnitOfWork {
  /** Must rollback repository, audit, outbox, nonce, and receipt writes together. */
  transaction<T>(operation: (transaction: RecruitingTransactionContext) => Promise<T>): Promise<T>;
}

export interface RecruitingRepository {
  loadPartyForUpdate(transaction: RecruitingTransactionContext, partyId: string): Promise<RecruitParty | null>;
  loadScrimForUpdate(transaction: RecruitingTransactionContext, scrimId: string): Promise<ScrimRecruit | null>;
  saveParty(transaction: RecruitingTransactionContext, input: Readonly<{ party: RecruitParty; expectedRevision: number; create: boolean }>): Promise<void>;
  saveScrim(transaction: RecruitingTransactionContext, input: Readonly<{ scrim: ScrimRecruit; expectedRevision: number; create: boolean }>): Promise<void>;
}

export interface RecruitingAuthorizationPort {
  /** Rechecks ADMIN/SUPER/JOB credentials or claims the verified BOT nonce in-transaction. */
  recheck(transaction: RecruitingTransactionContext, input: Readonly<{
    actor: RecruitingCommandActor;
    commandType: RecruitingCommand["type"];
    aggregateId: string;
    idempotency: RecruitingCommand["metadata"]["idempotency"];
  }>): Promise<void>;
}

export type RecruitMutationBody = JsonObject & Readonly<{
  aggregateKind: "PARTY" | "SCRIM";
  aggregateId: string;
  revision: number;
  status: string;
  commandType: RecruitingCommand["type"];
  data: JsonObject;
}>;

export type RecruitCommandReceipt = Readonly<{
  actorPrincipalId: string;
  scope: string;
  keyHash: Uint8Array;
  requestHash: Uint8Array;
  bodyDigestHex: string;
  responseStatus: 200 | 201;
  body: RecruitMutationBody;
  revision: number;
  createdAt: string;
  expiresAt: string;
}>;

export type RecruitReceiptClaim =
  | Readonly<{ kind: "CLAIMED" }>
  | Readonly<{ kind: "MISMATCH" }>
  | Readonly<{ kind: "REPLAY"; receipt: RecruitCommandReceipt }>;

export interface RecruitingReceiptPort {
  /** Claims the durable (principal, scope, request-key hash) row and compares the body fingerprint. */
  claim(transaction: RecruitingTransactionContext, command: RecruitingCommand): Promise<RecruitReceiptClaim>;
  complete(transaction: RecruitingTransactionContext, receipt: RecruitCommandReceipt): Promise<void>;
}

export type RecruitingAuditEvent = Readonly<{
  requestId: string;
  actorPrincipalId: string;
  action: string;
  targetType: "RECRUIT_PARTY" | "SCRIM_RECRUIT";
  targetId: string;
  before: JsonObject | null;
  after: JsonObject;
  occurredAt: string;
}>;

export type RecruitingOutboxEvent = Readonly<{
  id: string;
  requestId: string;
  aggregateType: "RECRUIT_PARTY" | "SCRIM_RECRUIT";
  aggregateId: string;
  aggregateRevision: number;
  eventType: string;
  dedupeKey: string;
  payload: JsonObject;
  occurredAt: string;
}>;

export interface RecruitingAuditPort {
  append(transaction: RecruitingTransactionContext, event: RecruitingAuditEvent): Promise<void>;
}

export interface RecruitingOutboxPort {
  append(transaction: RecruitingTransactionContext, event: RecruitingOutboxEvent): Promise<void>;
}

export interface RecruitingClockPort {
  now(): Date;
  receiptExpiresAt(now: Date): Date;
}

export type SeasonApplicationBridgeCommand = Readonly<{
  action: "UPSERT" | "CANCEL" | "STATUS";
  actorPrincipalId: string;
  seasonId: string;
  payload: JsonObject;
}>;

/** S09 delegates Kakao season application mutations to the S03 transaction contract. */
export interface SeasonApplicationBridgePort {
  execute(transaction: RecruitingTransactionContext, command: SeasonApplicationBridgeCommand): Promise<JsonObject>;
}

export const KAKAO_OPERATION_FORM_TYPES = ["FRIEND", "LEAVE", "MEETUP", "SUGGESTION"] as const;
export type KakaoOperationFormType = (typeof KAKAO_OPERATION_FORM_TYPES)[number];

/** The four operation forms share one bounded command port instead of four persistence implementations. */
export interface OperationFormBridgePort {
  submit(transaction: RecruitingTransactionContext, input: Readonly<{
    type: KakaoOperationFormType;
    actorPrincipalId: string;
    payload: JsonObject;
  }>): Promise<JsonObject>;
}

export interface RecruitingPrivateAssetPort {
  /** Stores a private object and returns only its internal asset id; never a public Blob URL. */
  stageInboundImage(input: Readonly<{
    requestId: string;
    bytes: Uint8Array;
    contentType: "image/png" | "image/jpeg" | "image/webp";
    sha256Hex: string;
    signal: AbortSignal;
  }>): Promise<Readonly<{ privateAssetId: string }>>;
  requestCompensationDelete(privateAssetId: string, signal: AbortSignal): Promise<void>;
}

export type RecruitingCommandResult = Readonly<{
  body: RecruitMutationBody;
  revision: number;
  replayed: boolean;
}>;
