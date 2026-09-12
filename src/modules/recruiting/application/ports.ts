import type { JsonObject } from "@/modules/competitions/core";

import type { PublicRecruitPartyDto, RecruitParty, ScrimRecruit } from "../domain/recruiting";
import type { RecruitingCommand, RecruitingCommandActor } from "./commands";
import type { PublicScrimRecruitDto } from "./public-dto";

export interface RecruitingTransactionContext {
  readonly recruitingTransaction: unique symbol;
}

export type RecruitingCompatTargetInput = Readonly<{
  kind: "PARTY" | "SCRIM";
  sourceRoomId: string;
  recruitDate: string;
  recruitNumber: number;
  /** PARTY lookups may be narrowed to the states accepted by the caller's command. */
  allowedPartyStatuses?: readonly RecruitParty["status"][];
}>;

export interface RecruitingUnitOfWork {
  /** Must rollback repository, audit, outbox, nonce, and receipt writes together. */
  transaction<T>(operation: (transaction: RecruitingTransactionContext) => Promise<T>): Promise<T>;
}

export interface RecruitingRepository {
  /** Allocates the next V1 party number under a transaction advisory lock. */
  allocateNextPartyIdentityForUpdate(transaction: RecruitingTransactionContext, input: Readonly<{
    sourceRoomId: string;
    recruitDate: string;
    preferredRecruitNumber: number | null;
  }>): Promise<Readonly<{ resetSequence: number; recruitNumber: number }> | null>;
  /** Allocates the next date-wide V1/V4 scrim number under a transaction advisory lock. */
  allocateNextScrimNumberForUpdate(
    transaction: RecruitingTransactionContext,
    recruitDate: string,
  ): Promise<number | null>;
  loadPartyForUpdate(transaction: RecruitingTransactionContext, partyId: string): Promise<RecruitParty | null>;
  loadScrimForUpdate(transaction: RecruitingTransactionContext, scrimId: string): Promise<ScrimRecruit | null>;
  /**
   * Returns at most two non-terminal destruction competitions while holding share
   * locks. CREATE_SCRIM uses the bounded result to distinguish one active target
   * from the unsafe zero/multiple-target cases inside the mutation transaction.
   */
  listActiveDestructionTournamentIdsForUpdate(transaction: RecruitingTransactionContext): Promise<readonly string[]>;
  saveParty(transaction: RecruitingTransactionContext, input: Readonly<{ party: RecruitParty; expectedRevision: number; create: boolean }>): Promise<void>;
  saveScrim(transaction: RecruitingTransactionContext, input: Readonly<{ scrim: ScrimRecruit; expectedRevision: number; create: boolean }>): Promise<void>;
}

export type PublicRecruitFeedDto = Readonly<{
  parties: readonly PublicRecruitPartyDto[];
  scrims: readonly PublicScrimRecruitDto[];
}>;

export type AdminRecruitingStatusDto = Readonly<{
  openPartyCount: number;
  openScrimCount: number;
  pendingOutboxCount: number;
  incompleteReceiptCount: number;
  activeNonceCount: number;
  activeImageSessionCount: number;
  unresolvedSeasonApplicationCount: number;
  recentRequests: readonly Readonly<{
    scope: string;
    completed: boolean;
    responseStatus: number | null;
    createdAt: string;
    expiresAt: string;
  }>[];
  recentParties: readonly Readonly<{
    id: string;
    revision: number;
    recruitDate: string;
    recruitNumber: number;
    status: RecruitParty["status"];
    title: string;
    memberCount: number;
    maximumMembers: number;
    updatedAt: string;
  }>[];
  recentScrims: readonly Readonly<{
    id: string;
    revision: number;
    recruitDate: string;
    scrimNumber: number;
    status: ScrimRecruit["status"];
    requesterTeamId: string | null;
    opponentTeamId: string | null;
    requesterTeamName: string | null;
    opponentTeamName: string | null;
    updatedAt: string;
  }>[];
}>;

export interface RecruitingQueryPort {
  listPublicFeed(): Promise<PublicRecruitFeedDto>;
  getAdminStatus(): Promise<AdminRecruitingStatusDto>;
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
