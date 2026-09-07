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
  status: "ALL" | RiotLinkStatus | RiotSyncJobStatus | "UNLINKED";
  source: "ALL" | "API" | "SYNC" | "AUDIT";
  page: number;
  pageSize: number;
}>;

export interface RiotQueryRepository {
  getPublicSummary(playerId: string): Promise<PublicRiotSummaryDto | null>;
  getOwnerStatus(ownerUserAccountId: string): Promise<OwnerRiotStatusDto | null>;
  listAdmin(query: AdminRiotQuery): Promise<AdminRiotPageDto>;
}

export function parseAdminRiotQuery(url: string): AdminRiotQuery | null {
  const params = new URL(url).searchParams;
  const allowed = new Set(["tab", "status", "source", "page", "pageSize"]);
  if ([...params.keys()].some((key) => !allowed.has(key))) return null;
  for (const key of allowed) if (params.getAll(key).length > 1) return null;
  const tab = params.get("tab") ?? "accounts";
  const status = params.get("status") ?? "ALL";
  const source = params.get("source") ?? "ALL";
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "25");
  if (!(["accounts", "sync", "logs"] as const).includes(tab as AdminRiotQuery["tab"])) return null;
  if (!(["ALL", "CONNECTED", "DISCONNECTED", "REVOKED", "UNLINKED", "QUEUED", "RUNNING", "RETRY_WAIT", "SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"] as const).includes(status as AdminRiotQuery["status"])) return null;
  if (!(["ALL", "API", "SYNC", "AUDIT"] as const).includes(source as AdminRiotQuery["source"])) return null;
  const accountStatus = ["ALL", "CONNECTED", "DISCONNECTED", "REVOKED", "UNLINKED", "FAILED"].includes(status);
  const syncStatus = ["ALL", "QUEUED", "RUNNING", "RETRY_WAIT", "SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"].includes(status);
  if ((tab === "accounts" && (!accountStatus || source !== "ALL")) || (tab === "sync" && (!syncStatus || source !== "ALL"))) return null;
  if (tab === "logs" && status !== "ALL") return null;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || page * pageSize > 5_000) return null;
  return { tab: tab as AdminRiotQuery["tab"], status: status as AdminRiotQuery["status"], source: source as AdminRiotQuery["source"], page, pageSize };
}
