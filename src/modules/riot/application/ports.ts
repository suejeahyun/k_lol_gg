import type {
  RiotAccountLink,
  RiotRsoState,
  RiotSyncJob,
  RiotSyncOutcome,
} from "../domain/riot-integration";

export interface RiotTransaction {
  readonly riotTransaction: unique symbol;
}

export type RiotAuthorizationIntent =
  | Readonly<{
      kind: "OWNER_SESSION";
      sessionId: string;
      role: "USER" | "ADMIN" | "SUPER_ADMIN";
      authVersion: number;
      transactionRecheck: true;
    }>
  | Readonly<{
      kind: "ADMIN_TOTP";
      sessionId: string;
      role: "ADMIN" | "SUPER_ADMIN";
      authVersion: number;
      minimumRole: "ADMIN" | "SUPER_ADMIN";
      requireTotp: true;
      transactionRecheck: true;
    }>
  | Readonly<{
      kind: "SIGNED_JOB";
      jobName: "riot-sync";
      nonce: string;
      timestampSeconds: number;
      bodyDigestHex: string;
      signatureHex: string;
      transactionRecheck: true;
    }>;

export type RiotAction =
  | "CONNECT_DIRECT"
  | "DISCONNECT"
  | "RSO_START"
  | "RSO_CALLBACK"
  | "REQUEST_SYNC"
  | "REQUEST_SYNC_BULK"
  | "REQUEST_SYNC_ALL"
  | "CLAIM_SYNC"
  | "FINISH_SYNC";

export type CurrentRiotActor =
  | Readonly<{
      purpose: "ACCOUNT";
      principalId: string;
      userAccountId: string;
      playerId: string | null;
      accountStatus: "APPROVED" | "PENDING" | "REJECTED" | "SUSPENDED" | "DELETED";
    }>
  | Readonly<{
      purpose: "ADMIN";
      principalId: string;
      userAccountId: string;
      role: "ADMIN" | "SUPER_ADMIN";
    }>
  | Readonly<{ purpose: "JOB"; principalId: string; jobName: "riot-sync" }>;

export interface RiotUnitOfWork {
  transaction<T>(operation: (transaction: RiotTransaction) => Promise<T>): Promise<T>;
}

export interface RiotFeatureFlagPort {
  /** Missing/false production configuration must return false. Rechecked inside every mutation transaction. */
  isEnabled(transaction: RiotTransaction): Promise<boolean>;
}

export interface RiotAuthorizationPort {
  /** Rechecks current session, ADMIN-purpose TOTP or signed JOB nonce inside the transaction. */
  recheck(
    transaction: RiotTransaction,
    input: Readonly<{ principalId: string; action: RiotAction; intent: RiotAuthorizationIntent }>,
  ): Promise<CurrentRiotActor | null>;
}

export interface RiotJobAuthorizationVerifierPort<Transaction = RiotTransaction> {
  /** Verifies signature freshness and atomically consumes the nonce without exposing the server secret. */
  verifyAndConsume(
    transaction: Transaction,
    intent: Extract<RiotAuthorizationIntent, { kind: "SIGNED_JOB" }>,
    action: Extract<RiotAction, "CLAIM_SYNC" | "FINISH_SYNC">,
  ): Promise<boolean>;
}

export type RiotSafeBody = Readonly<Record<string, string | number | boolean | null | readonly string[]>>;

export type RiotReceiptIdentity = Readonly<{
  principalId: string;
  scope: string;
  keyHash: Uint8Array;
  requestHash: Uint8Array;
  bodyDigestHex: string;
}>;

export type RiotCommandReceipt = RiotReceiptIdentity & Readonly<{
  body: RiotSafeBody;
  createdAt: string;
  expiresAt: string;
}>;

export type RiotReceiptClaim =
  | Readonly<{ kind: "CLAIMED" }>
  | Readonly<{ kind: "MISMATCH" }>
  | Readonly<{ kind: "REPLAY"; receipt: RiotCommandReceipt }>;

export type RiotReceiptInspection =
  | Readonly<{ kind: "NONE" }>
  | Readonly<{ kind: "MISMATCH" }>
  | Readonly<{ kind: "REPLAY"; receipt: RiotCommandReceipt }>;

export interface RiotReceiptPort {
  inspect(transaction: RiotTransaction, identity: RiotReceiptIdentity): Promise<RiotReceiptInspection>;
  claim(transaction: RiotTransaction, identity: RiotReceiptIdentity): Promise<RiotReceiptClaim>;
  complete(transaction: RiotTransaction, receipt: RiotCommandReceipt): Promise<void>;
}

export type RiotProjectionUpdate = Readonly<{
  playerId: string;
  gameName: string;
  tagLine: string;
  soloTier: string | null;
  soloRank: string | null;
  leaguePoints: number | null;
  wins: number | null;
  losses: number | null;
  syncedAt: Date;
}>;

export interface RiotRepository {
  loadPlayerOwnerAccountIdForUpdate(transaction: RiotTransaction, playerId: string): Promise<string | null>;
  loadLinkForPlayerForUpdate(transaction: RiotTransaction, playerId: string): Promise<RiotAccountLink | null>;
  loadLinkForUpdate(transaction: RiotTransaction, linkId: string): Promise<RiotAccountLink | null>;
  saveLink(transaction: RiotTransaction, link: RiotAccountLink, expectedRevision: number): Promise<void>;
  loadRsoStateForUpdate(transaction: RiotTransaction, stateDigestHex: string): Promise<RiotRsoState | null>;
  saveRsoState(transaction: RiotTransaction, state: RiotRsoState): Promise<void>;
  latestSyncRequestedAt(transaction: RiotTransaction, linkId: string): Promise<Date | null>;
  listConnectedLinksForUpdate(transaction: RiotTransaction, linkIds: readonly string[] | null): Promise<readonly RiotAccountLink[]>;
  saveSyncJob(transaction: RiotTransaction, job: RiotSyncJob): Promise<void>;
  loadNextClaimableSyncJobForUpdate(transaction: RiotTransaction, now: Date): Promise<RiotSyncJob | null>;
  loadSyncJobForUpdate(transaction: RiotTransaction, jobId: string): Promise<RiotSyncJob | null>;
  saveProjection(transaction: RiotTransaction, projection: RiotProjectionUpdate): Promise<void>;
}

export type RiotAuditEvent = Readonly<{
  requestId: string;
  actorPrincipalId: string;
  action: `RIOT_${RiotAction}`;
  targetId: string;
  before: RiotSafeBody;
  after: RiotSafeBody;
  occurredAt: string;
}>;

export type RiotOutboxEvent = Readonly<{
  id: string;
  requestId: string;
  aggregateId: string;
  aggregateRevision: number;
  eventType: `RIOT_${RiotAction}`;
  dedupeKey: string;
  payload: RiotSafeBody;
  occurredAt: string;
}>;

export interface RiotAuditPort {
  append(transaction: RiotTransaction, event: RiotAuditEvent): Promise<void>;
}

export interface RiotOutboxPort {
  append(transaction: RiotTransaction, event: RiotOutboxEvent): Promise<void>;
}

export interface RiotClockPort {
  now(): Date;
  receiptExpiresAt(now: Date): Date;
}

export interface RiotIdPort {
  next(kind: "LINK" | "RSO_STATE" | "SYNC_JOB" | "LEASE" | "OUTBOX"): string;
}

export type RiotIdentity = Readonly<{ gameName: string; tagLine: string; puuid: string }>;

/** The application never accepts an OAuth client secret or persists OAuth tokens. */
export interface RiotRsoPort {
  issueState(stateId: string): Readonly<{ publicState: string; digestHex: string }>;
  digestState(publicState: string): string;
  authorizationUrl(input: Readonly<{ publicState: string }>): string;
  /** exchangeId makes callback replay/crash recovery an explicit adapter responsibility. */
  exchangeOnce(input: Readonly<{ exchangeId: string; authorizationCode: string }>): Promise<RiotIdentity>;
}

export type RiotRankSnapshot = Readonly<{
  tier: string | null;
  rank: string | null;
  leaguePoints: number | null;
  wins: number | null;
  losses: number | null;
  partial: boolean;
}>;

export interface RiotGatewayPort {
  resolveRiotId(input: Readonly<{ gameName: string; tagLine: string }>): Promise<RiotIdentity>;
  fetchRank(input: Readonly<{ puuid: string }>): Promise<
    | Readonly<{ outcome: Extract<RiotSyncOutcome, { kind: "SUCCESS" }>; snapshot: RiotRankSnapshot }>
    | Readonly<{ outcome: Exclude<RiotSyncOutcome, { kind: "SUCCESS" }> }>
  >;
}

export class RiotGatewayError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "RATE_LIMITED" | "TRANSIENT" | "INVALID_RESPONSE",
    readonly retryAfterSeconds?: number,
  ) {
    super(`RIOT_GATEWAY_${code}`);
    this.name = "RiotGatewayError";
  }
}

/** Production implementation encrypts PUUID; the application stores only the protected representation. */
export interface RiotIdentityProtectorPort {
  protect(puuid: string): Promise<string>;
  reveal(protectedPuuid: string): Promise<string>;
}
