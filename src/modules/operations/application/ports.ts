import type { AuthRole, AuthSessionAccountStatus } from "@/modules/auth/domain/auth-session";
import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";

import type { SiteSettings, SiteSettingsPatch } from "../domain/site-settings";

export type OperationsActor = Readonly<{
  session: TransactionSessionActor;
  role: AuthRole;
  accountStatus: AuthSessionAccountStatus;
}>;

export type OperationsCommandMetadata = Readonly<{
  requestId: string;
  requestKey: string;
  requestHashHex: string;
  expectedRevision: number;
}>;

export type OperationsCommandResult<T extends Record<string, unknown>> = Readonly<{
  status: number;
  body: T;
  revision: number;
  replayed: boolean;
}>;

export type PublicOperationsDashboardDto = Readonly<{
  accounts: number;
  activePlayers: number;
  publishedMatches: number;
  pendingOperationsEvents: number;
  lastAuditAt: string | null;
}>;

export type AuditLogDto = Readonly<{
  id: number;
  requestId: string;
  actorUserAccountId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: string;
}>;

export type AuditStatsDto = Readonly<{
  totalEvents: number;
  eventsLast24Hours: number;
  uniqueActorsLast24Hours: number;
  latestEventAt: string | null;
}>;

export type AiRequestLedgerDto = Readonly<{
  id: string;
  requestId: string;
  actorUserAccountId: string;
  actorRole: AuthRole;
  status: "DENIED" | "PENDING" | "SUCCEEDED" | "FAILED";
  promptHashPrefix: string;
  promptCharCount: number;
  outputCharCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicros: number;
  adapterKey: string;
  failureCode: string | null;
  createdAt: string;
  completedAt: string | null;
}>;

export type AiCompletionResult = Readonly<{
  text: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicros: number;
}>;

/** Implementations must not persist, log or echo the prompt outside the caller response. */
export interface AiCompletionPort {
  readonly key: string;
  complete(input: Readonly<{ prompt: string; maximumCostMicros: number }>): Promise<AiCompletionResult>;
}

export type AiRequestResultBody = Readonly<{
  ok: boolean;
  answer?: string;
  code?: string;
  requestId: string;
}>;

export interface OperationsQueryPort {
  getSiteSettings(): Promise<SiteSettings>;
  getDashboard(): Promise<PublicOperationsDashboardDto>;
  listAuditLogs(input: Readonly<{ page: number; pageSize: number; action?: string }>): Promise<Readonly<{ items: AuditLogDto[]; totalCount: number }>>;
  getAuditStats(): Promise<AuditStatsDto>;
  listAiRequests(input: Readonly<{ page: number; pageSize: number; status?: AiRequestLedgerDto["status"] }>): Promise<Readonly<{ items: AiRequestLedgerDto[]; totalCount: number }>>;
  buildBackup(kind: "players" | "matches" | "mmr" | "rankings", actor: OperationsActor): Promise<string>;
}

export interface OperationsCommandPort {
  updateSettings(input: Readonly<{
    actor: OperationsActor;
    metadata: OperationsCommandMetadata;
    patch: SiteSettingsPatch;
  }>): Promise<OperationsCommandResult<{ settings: SiteSettings }>>;
  runAdminCleanup(input: Readonly<{
    actor: OperationsActor;
    metadata: OperationsCommandMetadata;
    kind: "audit" | "rate-limits";
    retentionDays: number;
  }>): Promise<OperationsCommandResult<{ runId: string; deleted: number; kind: string }>>;
  runSignedMaintenance(input: Readonly<{
    jobName: "maintenance";
    nonce: string;
    requestHashHex: string;
    requestId: string;
  }>): Promise<Readonly<{ runId: string; counts: Record<string, number> }>>;
  runSignedKakaoDailyClose(input: Readonly<{
    jobName: "kakao-daily-close";
    nonce: string;
    requestHashHex: string;
    requestId: string;
    idleHours: number;
    maximumClosures: number;
  }>): Promise<Readonly<{ runId: string; counts: Record<string, number> }>>;
  requestAi(input: Readonly<{
    actor: OperationsActor;
    metadata: OperationsCommandMetadata;
    prompt: string;
  }>): Promise<OperationsCommandResult<AiRequestResultBody>>;
}
