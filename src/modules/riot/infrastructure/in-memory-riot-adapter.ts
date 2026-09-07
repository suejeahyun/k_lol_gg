import { randomUUID } from "node:crypto";

import type { RiotApplicationDependencies } from "../application/riot-application";
import type {
  RiotAuditEvent,
  RiotCommandReceipt,
  RiotOutboxEvent,
  RiotProjectionUpdate,
  RiotReceiptIdentity,
  RiotTransaction,
} from "../application/ports";
import type { AdminRiotPageDto, AdminRiotQuery, RiotQueryRepository } from "../application/riot-query";
import type { RiotAccountLink, RiotRsoState, RiotSyncJob } from "../domain/riot-integration";

type MemoryState = {
  links: Map<string, RiotAccountLink>;
  rsoStates: Map<string, RiotRsoState>;
  jobs: Map<string, RiotSyncJob>;
  receipts: Map<string, RiotCommandReceipt>;
  audit: RiotAuditEvent[];
  outbox: RiotOutboxEvent[];
  projections: Map<string, RiotProjectionUpdate>;
};

function same(left: Uint8Array, right: Uint8Array) {
  return Buffer.from(left).equals(Buffer.from(right));
}

/** Explicitly test/development-only transactional adapter. */
export class InMemoryRiotAdapter implements RiotQueryRepository {
  private state: MemoryState = {
    links: new Map(),
    rsoStates: new Map(),
    jobs: new Map(),
    receipts: new Map(),
    audit: [],
    outbox: [],
    projections: new Map(),
  };
  private readonly activeTransactions = new WeakSet<RiotTransaction>();
  private readonly ownerPlayers = new Map<string, string>();
  private readonly playerIdentities = new Map<string, Readonly<{ gameName: string; tagLine: string }>>();
  readonly dependencies: Pick<
    RiotApplicationDependencies,
    "unitOfWork" | "features" | "authorization" | "receipts" | "repository" | "audit" | "outbox" | "clock" | "ids"
  >;

  constructor(private readonly featureEnabled: boolean) {
    const assertTransaction = (transaction: RiotTransaction) => {
      if (!this.activeTransactions.has(transaction)) throw new Error("Riot transaction context escaped its unit of work.");
    };
    const receiptKey = (identity: RiotReceiptIdentity) => `${identity.principalId}:${identity.scope}:${Buffer.from(identity.keyHash).toString("hex")}`;
    this.dependencies = {
      unitOfWork: {
        transaction: async (operation) => {
          const before = structuredClone(this.state);
          const context = Object.freeze({}) as RiotTransaction;
          this.activeTransactions.add(context);
          try { return await operation(context); }
          catch (error) {
            this.state = before;
            throw error;
          } finally { this.activeTransactions.delete(context); }
        },
      },
      features: { isEnabled: async (transaction) => (assertTransaction(transaction), this.featureEnabled) },
      authorization: {
        recheck: async (transaction, input) => {
          assertTransaction(transaction);
          const intent = input.intent;
          if (intent.kind === "SIGNED_JOB") {
            return { purpose: "JOB", principalId: input.principalId, jobName: "riot-sync" };
          }
          if (intent.kind === "ADMIN_TOTP") {
            return { purpose: "ADMIN", principalId: input.principalId, userAccountId: input.principalId, role: intent.role };
          }
          const playerId = this.ownerPlayers.get(input.principalId) ?? input.principalId;
          this.ownerPlayers.set(input.principalId, playerId);
          return { purpose: "ACCOUNT", principalId: input.principalId, userAccountId: input.principalId, playerId, accountStatus: "APPROVED" };
        },
      },
      receipts: {
        inspect: async (transaction, identity) => {
          assertTransaction(transaction);
          const receipt = this.state.receipts.get(receiptKey(identity));
          if (!receipt) return { kind: "NONE" };
          return same(receipt.requestHash, identity.requestHash) && receipt.bodyDigestHex === identity.bodyDigestHex
            ? { kind: "REPLAY", receipt }
            : { kind: "MISMATCH" };
        },
        claim: async (transaction, identity) => {
          assertTransaction(transaction);
          const receipt = this.state.receipts.get(receiptKey(identity));
          if (!receipt) return { kind: "CLAIMED" };
          return same(receipt.requestHash, identity.requestHash) && receipt.bodyDigestHex === identity.bodyDigestHex
            ? { kind: "REPLAY", receipt }
            : { kind: "MISMATCH" };
        },
        complete: async (transaction, receipt) => {
          assertTransaction(transaction);
          this.state.receipts.set(receiptKey(receipt), structuredClone(receipt));
        },
      },
      repository: {
        loadPlayerOwnerAccountIdForUpdate: async (transaction, playerId) => {
          assertTransaction(transaction);
          return [...this.ownerPlayers.entries()].find((entry) => entry[1] === playerId)?.[0] ?? null;
        },
        loadPlayerRiotIdentityForUpdate: async (transaction, playerId) => {
          assertTransaction(transaction);
          const ownerAccountId = [...this.ownerPlayers.entries()].find((entry) => entry[1] === playerId)?.[0];
          const identity = this.playerIdentities.get(playerId);
          return ownerAccountId && identity ? { playerId, ownerAccountId, ...identity } : null;
        },
        loadLinkForPlayerForUpdate: async (transaction, playerId) => {
          assertTransaction(transaction);
          return [...this.state.links.values()].find((link) => link.playerId === playerId) ?? null;
        },
        loadLinkForUpdate: async (transaction, linkId) => (assertTransaction(transaction), this.state.links.get(linkId) ?? null),
        saveLink: async (transaction, link) => {
          assertTransaction(transaction);
          this.state.links.set(link.id, structuredClone(link));
          this.ownerPlayers.set(link.ownerAccountId, link.playerId);
        },
        loadRsoStateForUpdate: async (transaction, digestHex) => {
          assertTransaction(transaction);
          return [...this.state.rsoStates.values()].find((state) => state.stateDigestHex === digestHex) ?? null;
        },
        saveRsoState: async (transaction, state) => {
          assertTransaction(transaction);
          this.state.rsoStates.set(state.id, structuredClone(state));
        },
        latestSyncRequestedAt: async (transaction, linkId) => {
          assertTransaction(transaction);
          return [...this.state.jobs.values()].filter((job) => job.linkId === linkId).sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime())[0]?.requestedAt ?? null;
        },
        listConnectedLinksForUpdate: async (transaction, linkIds) => {
          assertTransaction(transaction);
          return [...this.state.links.values()].filter((link) => link.status === "CONNECTED" && (!linkIds || linkIds.includes(link.id)));
        },
        saveSyncJob: async (transaction, job) => {
          assertTransaction(transaction);
          this.state.jobs.set(job.id, structuredClone(job));
        },
        loadNextClaimableSyncJobForUpdate: async (transaction, now) => {
          assertTransaction(transaction);
          return [...this.state.jobs.values()].filter((job) =>
            (["QUEUED", "RETRY_WAIT"].includes(job.status) && job.availableAt <= now) ||
            (job.status === "RUNNING" && job.lockedAt !== null && job.lockedAt.getTime() <= now.getTime() - 60_000))
            .sort((left, right) => left.availableAt.getTime() - right.availableAt.getTime() || left.id.localeCompare(right.id))[0] ?? null;
        },
        loadSyncJobForUpdate: async (transaction, jobId) => (assertTransaction(transaction), this.state.jobs.get(jobId) ?? null),
        saveProjection: async (transaction, projection) => {
          assertTransaction(transaction);
          this.state.projections.set(projection.playerId, structuredClone(projection));
        },
      },
      audit: { append: async (transaction, event) => (assertTransaction(transaction), this.state.audit.push(structuredClone(event)), undefined) },
      outbox: { append: async (transaction, event) => (assertTransaction(transaction), this.state.outbox.push(structuredClone(event)), undefined) },
      clock: { now: () => new Date(), receiptExpiresAt: (now) => new Date(now.getTime() + 24 * 60 * 60_000) },
      ids: { next: () => randomUUID() },
    };
  }

  bindOwner(ownerUserAccountId: string, playerId: string) {
    this.ownerPlayers.set(ownerUserAccountId, playerId);
  }

  bindBulkCandidate(ownerUserAccountId: string, playerId: string, gameName: string, tagLine: string) {
    this.ownerPlayers.set(ownerUserAccountId, playerId);
    this.playerIdentities.set(playerId, { gameName, tagLine });
  }

  async getPublicSummary(playerId: string) {
    const projection = this.state.projections.get(playerId);
    const link = [...this.state.links.values()].find((candidate) => candidate.playerId === playerId && candidate.status === "CONNECTED");
    if (!projection || !link) return null;
    return {
      playerId,
      riotId: `${projection.gameName}#${projection.tagLine}`,
      soloTier: projection.soloTier,
      soloRank: projection.soloRank,
      leaguePoints: projection.leaguePoints,
      wins: projection.wins,
      losses: projection.losses,
      lastSyncedAt: projection.syncedAt.toISOString(),
    };
  }

  async getOwnerStatus(ownerUserAccountId: string) {
    const playerId = this.ownerPlayers.get(ownerUserAccountId) ?? ownerUserAccountId;
    const link = [...this.state.links.values()].find((candidate) => candidate.playerId === playerId) ?? null;
    const lastSync = link ? [...this.state.jobs.values()].filter((job) => job.linkId === link.id).sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime())[0] ?? null : null;
    return {
      featureEnabled: true as const,
      playerId,
      link: link ? { id: link.id, revision: link.revision, riotId: `${link.gameName}#${link.tagLine}`, method: link.method, status: link.status, linkedAt: link.linkedAt.toISOString() } : null,
      lastSync: lastSync ? { id: lastSync.id, status: lastSync.status, attemptCount: lastSync.attemptCount, requestedAt: lastSync.requestedAt.toISOString(), availableAt: lastSync.availableAt.toISOString(), failureCode: lastSync.failureCode } : null,
      summary: await this.getPublicSummary(playerId),
    };
  }

  async listAdmin(query: AdminRiotQuery): Promise<AdminRiotPageDto> {
    const empty = { items: [], syncItems: [], logItems: [] } as const;
    const finish = (payload: Pick<AdminRiotPageDto, "items" | "syncItems" | "logItems">, total: number): AdminRiotPageDto => ({
      tab: query.tab,
      ...payload,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    });
    const accountRows = [...this.ownerPlayers.entries()].map(([ownerUserAccountId, playerId]) => {
      const link = [...this.state.links.values()].find((candidate) => candidate.playerId === playerId) ?? null;
      const lastJob = link ? [...this.state.jobs.values()].filter((job) => job.linkId === link.id).sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime())[0] ?? null : null;
      const projection = this.state.projections.get(playerId);
      return {
        playerId,
        displayName: playerId,
        ownerUserAccountId,
        linkId: link?.id ?? null,
        revision: link?.revision ?? null,
        riotId: link ? `${link.gameName}#${link.tagLine}` : "미연결",
        method: link?.method ?? null,
        status: link?.status ?? "UNLINKED" as const,
        lastSyncStatus: lastJob?.status ?? null,
        lastSyncedAt: projection?.syncedAt.toISOString() ?? null,
        failureCode: lastJob?.failureCode ?? null,
      };
    });
    const start = (query.page - 1) * query.pageSize;
    if (query.tab === "accounts") {
      const needle = query.q.toLocaleLowerCase("ko-KR");
      const rows = accountRows.filter((row) =>
        (query.status === "ALL" || (query.status === "FAILED" ? row.lastSyncStatus === "FAILED" : row.status === query.status)) &&
        (query.action !== "bulk-link" || row.status === "UNLINKED") &&
        (!needle || `${row.displayName} ${row.riotId}`.toLocaleLowerCase("ko-KR").includes(needle))
      );
      return finish({ ...empty, items: rows.slice(start, start + query.pageSize) }, rows.length);
    }
    const syncRows = [...this.state.jobs.values()].map((job) => {
      const link = this.state.links.get(job.linkId)!;
      const displayName = [...this.ownerPlayers.entries()].find((entry) => entry[1] === link?.playerId)?.[1] ?? "연결 플레이어";
      return {
        jobId: job.id,
        linkId: job.linkId,
        displayName,
        riotId: link ? `${link.gameName}#${link.tagLine}` : "연결 정보 없음",
        status: job.status,
        requestedBy: job.requestedBy,
        attemptCount: job.attemptCount,
        maximumAttempts: job.maximumAttempts,
        requestedAt: job.requestedAt.toISOString(),
        availableAt: job.availableAt.toISOString(),
        completedAt: job.completedAt?.toISOString() ?? null,
        failureCode: job.failureCode,
      };
    }).sort((left, right) => right.requestedAt.localeCompare(left.requestedAt) || left.jobId.localeCompare(right.jobId));
    if (query.tab === "sync") {
      const rows = syncRows.filter((row) => query.status === "ALL" || row.status === query.status);
      return finish({ ...empty, syncItems: rows.slice(start, start + query.pageSize) }, rows.length);
    }
    const logRows = [
      ...(query.source === "ALL" || query.source === "API" ? syncRows.map((row) => ({
        id: `api:${row.jobId}`,
        source: "API" as const,
        occurredAt: row.completedAt ?? row.requestedAt,
        title: "Riot 전적 API 동기화",
        detail: `${row.displayName} · ${row.failureCode ?? "응답 처리 완료"}`,
        status: row.status,
      })) : []),
      ...(query.source === "ALL" || query.source === "SYNC" ? this.state.outbox.map((row) => ({
        id: `sync:${row.id}`,
        source: "SYNC" as const,
        occurredAt: row.occurredAt,
        title: "동기화 이벤트",
        detail: row.eventType,
        status: "PENDING",
      })) : []),
      ...(query.source === "ALL" || query.source === "AUDIT" ? this.state.audit.map((row, index) => ({
        id: `audit:${index}`,
        source: "AUDIT" as const,
        occurredAt: row.occurredAt,
        title: "관리 감사 기록",
        detail: row.action,
        status: "RECORDED",
      })) : []),
    ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.id.localeCompare(right.id));
    return finish({ ...empty, logItems: logRows.slice(start, start + query.pageSize) }, logRows.length);
  }
}
