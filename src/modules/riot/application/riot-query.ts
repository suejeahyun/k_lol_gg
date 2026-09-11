import type { PublicRiotSummaryDto, RiotLinkMethod, RiotLinkStatus, RiotSyncJobStatus } from "../domain/riot-integration";

export type OwnerRiotStatusDto = Readonly<{
  featureEnabled: true;
  playerId: string;
  link: null | Readonly<{
    id: string;
    revision: number;
    riotId: string;
    method: RiotLinkMethod;
    status: RiotLinkStatus;
    linkedAt: string;
  }>;
  lastSync: null | Readonly<{
    id: string;
    status: RiotSyncJobStatus;
    attemptCount: number;
    requestedAt: string;
    availableAt: string;
    failureCode: string | null;
  }>;
  summary: PublicRiotSummaryDto | null;
}>;

export type AdminRiotRowDto = Readonly<{
  playerId: string;
  displayName: string;
  ownerUserAccountId: string | null;
  linkId: string | null;
  revision: number | null;
  riotId: string;
  method: RiotLinkMethod | null;
  status: RiotLinkStatus | "UNLINKED";
  lastSyncStatus: RiotSyncJobStatus | null;
  lastSyncedAt: string | null;
  failureCode: string | null;
}>;

export type AdminRiotSyncRowDto = Readonly<{
  jobId: string;
  linkId: string;
  displayName: string;
  riotId: string;
  status: RiotSyncJobStatus;
  requestedBy: "OWNER" | "ADMIN" | "SUPER_ADMIN" | "JOB";
  attemptCount: number;
  maximumAttempts: number;
  requestedAt: string;
  availableAt: string;
  completedAt: string | null;
  failureCode: string | null;
}>;

export type AdminRiotLogRowDto = Readonly<{
  id: string;
  source: "API" | "SYNC" | "AUDIT";
  occurredAt: string;
  title: string;
  detail: string;
  status: string;
}>;

export type AdminRiotPageDto = Readonly<{
  tab: "accounts" | "sync" | "logs";
  items: readonly AdminRiotRowDto[];
  syncItems: readonly AdminRiotSyncRowDto[];
  logItems: readonly AdminRiotLogRowDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}>;

export type AdminRiotQuery = Readonly<{
  tab: "accounts" | "sync" | "logs";
  action: "NONE" | "bulk-link";
  status: "ALL" | RiotLinkStatus | RiotSyncJobStatus | "UNLINKED";
  source: "ALL" | "API" | "SYNC" | "AUDIT";
  q: string;
  batchSize: number;
  page: number;
  pageSize: number;
}>;

export interface RiotQueryRepository {
  getPublicSummary(playerId: string): Promise<PublicRiotSummaryDto | null>;
  getOwnerStatus(ownerUserAccountId: string): Promise<OwnerRiotStatusDto | null>;
  listAdmin(query: AdminRiotQuery): Promise<AdminRiotPageDto>;
}

export type PublicRiotProfileState =
  | Readonly<{ kind: "PLAYER_NOT_FOUND" }>
  | Readonly<{ kind: "UNLINKED" }>
  | Readonly<{ kind: "PENDING_SYNC"; connectionState: "CONNECTED" }>
  | Readonly<{ kind: "STALE_SNAPSHOT"; summary: PublicRiotSummaryDto }>
  | Readonly<{ kind: "RATE_LIMITED"; summary: PublicRiotSummaryDto | null; retryAfterSeconds: number | null }>
  | Readonly<{ kind: "TEMPORARY_ERROR"; summary: PublicRiotSummaryDto | null }>
  | Readonly<{ kind: "READY"; summary: PublicRiotSummaryDto }>;

export const PUBLIC_RIOT_SNAPSHOT_STALE_AFTER_MS = 24 * 60 * 60 * 1_000;

export function resolvePublicRiotProfileState(input: Readonly<{
  playerFound: boolean;
  linked: boolean;
  summary: PublicRiotSummaryDto | null;
  latestSync: null | Readonly<{ status: RiotSyncJobStatus; failureCode: string | null; availableAt: Date }>;
  now: Date;
}>): PublicRiotProfileState {
  if (!input.playerFound) return { kind: "PLAYER_NOT_FOUND" };
  if (!input.linked) return { kind: "UNLINKED" };
  if (input.latestSync?.failureCode === "RATE_LIMITED") {
    return {
      kind: "RATE_LIMITED",
      summary: input.summary,
      retryAfterSeconds: input.latestSync.status === "RETRY_WAIT"
        ? Math.max(0, Math.ceil((input.latestSync.availableAt.getTime() - input.now.getTime()) / 1_000))
        : null,
    };
  }
  if (input.latestSync?.failureCode && ["TIMEOUT", "UPSTREAM_5XX", "NETWORK"].includes(input.latestSync.failureCode)) {
    return { kind: "TEMPORARY_ERROR", summary: input.summary };
  }
  if (!input.summary) return { kind: "PENDING_SYNC", connectionState: "CONNECTED" };
  const lastSyncedAt = input.summary.lastSyncedAt;
  if (!lastSyncedAt) return { kind: "PENDING_SYNC", connectionState: "CONNECTED" };
  if (input.now.getTime() - new Date(lastSyncedAt).getTime() > PUBLIC_RIOT_SNAPSHOT_STALE_AFTER_MS) {
    return { kind: "STALE_SNAPSHOT", summary: input.summary };
  }
  return { kind: "READY", summary: input.summary };
}

export interface PublicRiotProfileQueryRepository {
  getPublicProfileState(playerId: string): Promise<PublicRiotProfileState>;
}

const publicPlayerIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isPublicRiotPlayerId(value: string): boolean {
  return publicPlayerIdPattern.test(value);
}

export function parseAdminRiotQuery(url: string): AdminRiotQuery | null {
  const params = new URL(url).searchParams;
  const allowed = new Set(["tab", "action", "status", "source", "q", "batchSize", "page", "pageSize"]);
  if ([...params.keys()].some((key) => !allowed.has(key))) return null;
  for (const key of allowed) if (params.getAll(key).length > 1) return null;
  const tab = params.get("tab") ?? "accounts";
  const action = params.get("action") ?? "NONE";
  const status = params.get("status") ?? "ALL";
  const source = params.get("source") ?? "ALL";
  const q = (params.get("q") ?? "").normalize("NFKC").trim();
  const batchSize = Number(params.get("batchSize") ?? "10");
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "25");
  if (!(["accounts", "sync", "logs"] as const).includes(tab as AdminRiotQuery["tab"])) return null;
  if (!(action === "NONE" || action === "bulk-link")) return null;
  if (!(["ALL", "CONNECTED", "DISCONNECTED", "REVOKED", "UNLINKED", "QUEUED", "RUNNING", "RETRY_WAIT", "SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"] as const).includes(status as AdminRiotQuery["status"])) return null;
  if (!(["ALL", "API", "SYNC", "AUDIT"] as const).includes(source as AdminRiotQuery["source"])) return null;
  const accountStatus = ["ALL", "CONNECTED", "DISCONNECTED", "REVOKED", "UNLINKED", "FAILED"].includes(status);
  const syncStatus = ["ALL", "QUEUED", "RUNNING", "RETRY_WAIT", "SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"].includes(status);
  if ((tab === "accounts" && (!accountStatus || source !== "ALL")) || (tab === "sync" && (!syncStatus || source !== "ALL"))) return null;
  if (tab === "logs" && status !== "ALL") return null;
  if (action === "bulk-link") {
    if (tab !== "accounts" || !["ALL", "UNLINKED"].includes(status) || source !== "ALL" || page !== 1 || params.has("pageSize")) return null;
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 30 || q.length > 100 || /[\u0000-\u001f\u007f]/u.test(q)) return null;
    return { tab: "accounts", action, status: "UNLINKED", source: "ALL", q, batchSize, page: 1, pageSize: batchSize };
  }
  if (params.has("q") || params.has("batchSize")) return null;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || page * pageSize > 5_000) return null;
  return { tab: tab as AdminRiotQuery["tab"], action: "NONE", status: status as AdminRiotQuery["status"], source: source as AdminRiotQuery["source"], q: "", batchSize: 10, page, pageSize };
}
