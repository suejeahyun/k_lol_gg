export type RiotLinkMethod = "DIRECT_OWNER" | "RSO_VERIFIED" | "ADMIN";
export type RiotLinkStatus = "CONNECTED" | "DISCONNECTED" | "REVOKED";
export type RiotSyncJobStatus = "QUEUED" | "RUNNING" | "RETRY_WAIT" | "SUCCEEDED" | "PARTIAL" | "FAILED" | "CANCELLED";

export type RiotAccountLink = Readonly<{
  id: string;
  revision: number;
  playerId: string;
  ownerAccountId: string;
  gameName: string;
  tagLine: string;
  puuidCiphertext: string | null;
  method: RiotLinkMethod;
  status: RiotLinkStatus;
  linkedAt: Date;
  disconnectedAt: Date | null;
}>;

export type RiotRsoState = Readonly<{
  id: string;
  ownerAccountId: string;
  stateDigestHex: string;
  returnTo: string;
  expiresAt: Date;
  consumedAt: Date | null;
}>;

export type RiotSyncJob = Readonly<{
  id: string;
  revision: number;
  linkId: string;
  requestedBy: "OWNER" | "ADMIN" | "SUPER_ADMIN" | "JOB";
  status: RiotSyncJobStatus;
  attemptCount: number;
  maximumAttempts: number;
  availableAt: Date;
  lockedAt: Date | null;
  completedAt: Date | null;
  failureCode: string | null;
}>;

export type RiotSyncOutcome =
  | Readonly<{ kind: "SUCCESS"; partial: boolean }>
  | Readonly<{ kind: "RATE_LIMITED"; retryAfterSeconds: number }>
  | Readonly<{ kind: "TRANSIENT_FAILURE"; code: "TIMEOUT" | "UPSTREAM_5XX" | "NETWORK" }>
  | Readonly<{ kind: "PERMANENT_FAILURE"; code: "NOT_FOUND" | "UNAUTHORIZED" | "INVALID_RESPONSE" }>;

export type PublicRiotSummaryDto = Readonly<{
  playerId: string;
  riotId: string;
  soloTier: string | null;
  soloRank: string | null;
  leaguePoints: number | null;
  wins: number | null;
  losses: number | null;
  lastSyncedAt: string | null;
}>;

export type RiotSummaryProjection = Readonly<{
  playerId: string;
  gameName: string;
  tagLine: string;
  soloTier: string | null;
  soloRank: string | null;
  leaguePoints: number | null;
  wins: number | null;
  losses: number | null;
  lastSyncedAt: Date | null;
  puuid: string | null;
  requestLogIds: readonly string[];
}>;

export interface RiotApiPort {
  fetchAccountByRiotId(input: Readonly<{ gameName: string; tagLine: string }>): Promise<Readonly<{ puuid: string }>>;
  fetchSoloRank(input: Readonly<{ puuid: string }>): Promise<Readonly<{
    tier: string | null;
    rank: string | null;
    leaguePoints: number | null;
    wins: number | null;
    losses: number | null;
  }>>;
}

function identifier(value: string, code: string): string {
  if (!value || value !== value.trim() || value.length > 200) throw new Error(code);
  return value;
}

function finiteDate(value: Date, code: string): void {
  if (!Number.isFinite(value.getTime())) throw new Error(code);
}

function expectedRevision(actual: number, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 0 || actual !== expected) throw new Error("STALE_RIOT_REVISION");
}

export function canonicalRiotId(input: Readonly<{ gameName: string; tagLine: string }>): Readonly<{
  gameName: string;
  tagLine: string;
  normalizedKey: string;
}> {
  const gameName = input.gameName.normalize("NFKC").trim().replace(/\s+/g, " ");
  const tagLine = input.tagLine.normalize("NFKC").trim();
  if (!gameName || gameName.length > 16 || /[#\u0000-\u001f\u007f]/.test(gameName)) throw new Error("INVALID_RIOT_GAME_NAME");
  if (!tagLine || tagLine.length > 5 || /[#\s\u0000-\u001f\u007f]/.test(tagLine)) throw new Error("INVALID_RIOT_TAG_LINE");
  return {
    gameName,
    tagLine,
    normalizedKey: `${gameName.toLocaleLowerCase("ko-KR")}#${tagLine.toLocaleLowerCase("en-US")}`,
  };
}

export function safeRsoReturnTo(value: string | null | undefined): string {
  const candidate = value || "/account/riot";
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    candidate.includes("\u0000") ||
    candidate.length > 500
  ) {
    return "/account/riot";
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate, "https://v2.invalid");
  } catch {
    return "/account/riot";
  }
  return parsed.origin === "https://v2.invalid" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/account/riot";
}

export function createRsoState(input: Readonly<{
  id: string;
  ownerAccountId: string;
  stateDigestHex: string;
  returnTo?: string | null;
  now: Date;
  ttlMilliseconds?: number;
}>): RiotRsoState {
  finiteDate(input.now, "INVALID_RSO_TIME");
  const ttl = input.ttlMilliseconds ?? 10 * 60 * 1_000;
  if (!Number.isSafeInteger(ttl) || ttl < 60_000 || ttl > 30 * 60 * 1_000) throw new Error("INVALID_RSO_TTL");
  if (!/^[a-f0-9]{64}$/.test(input.stateDigestHex)) throw new Error("INVALID_RSO_STATE_DIGEST");
  return {
    id: identifier(input.id, "INVALID_RSO_ID"),
    ownerAccountId: identifier(input.ownerAccountId, "INVALID_RSO_OWNER"),
    stateDigestHex: input.stateDigestHex,
    returnTo: safeRsoReturnTo(input.returnTo),
    expiresAt: new Date(input.now.getTime() + ttl),
    consumedAt: null,
  };
}

export function consumeRsoState(input: Readonly<{
  state: RiotRsoState;
  ownerAccountId: string;
  presentedDigestHex: string;
  now: Date;
}>): RiotRsoState {
  finiteDate(input.now, "INVALID_RSO_TIME");
  if (
    input.state.ownerAccountId !== input.ownerAccountId ||
    input.state.stateDigestHex !== input.presentedDigestHex
  ) throw new Error("RSO_STATE_NOT_FOUND");
  if (input.state.consumedAt) throw new Error("RSO_STATE_ALREADY_CONSUMED");
  if (input.state.expiresAt.getTime() <= input.now.getTime()) throw new Error("RSO_STATE_EXPIRED");
  return { ...input.state, consumedAt: input.now };
}

export function disconnectRiotAccount(input: Readonly<{
  link: RiotAccountLink;
  expectedRevision: number;
  ownerAccountId: string;
  actor: "OWNER" | "ADMIN";
  now: Date;
}>): RiotAccountLink {
  expectedRevision(input.link.revision, input.expectedRevision);
  finiteDate(input.now, "INVALID_RIOT_TIME");
  if (input.actor === "OWNER" && input.link.ownerAccountId !== input.ownerAccountId) throw new Error("RIOT_LINK_NOT_FOUND");
  if (input.link.status !== "CONNECTED") throw new Error("RIOT_LINK_NOT_CONNECTED");
  return { ...input.link, revision: input.link.revision + 1, status: "DISCONNECTED", disconnectedAt: input.now, puuidCiphertext: null };
}

export function createRiotSyncJob(input: Readonly<{
  id: string;
  linkId: string;
  requestedBy: RiotSyncJob["requestedBy"];
  now: Date;
  maximumAttempts?: number;
}>): RiotSyncJob {
  finiteDate(input.now, "INVALID_RIOT_SYNC_TIME");
  const maximumAttempts = input.maximumAttempts ?? 5;
  if (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1 || maximumAttempts > 10) throw new Error("INVALID_RIOT_SYNC_ATTEMPTS");
  return {
    id: identifier(input.id, "INVALID_RIOT_SYNC_ID"),
    revision: 0,
    linkId: identifier(input.linkId, "INVALID_RIOT_LINK_ID"),
    requestedBy: input.requestedBy,
    status: "QUEUED",
    attemptCount: 0,
    maximumAttempts,
    availableAt: input.now,
    lockedAt: null,
    completedAt: null,
    failureCode: null,
  };
}

export function claimRiotSyncJob(input: Readonly<{
  job: RiotSyncJob;
  expectedRevision: number;
  now: Date;
  leaseMilliseconds?: number;
}>): RiotSyncJob {
  expectedRevision(input.job.revision, input.expectedRevision);
  finiteDate(input.now, "INVALID_RIOT_SYNC_TIME");
  const staleLeaseAt = input.now.getTime() - (input.leaseMilliseconds ?? 60_000);
  const claimable =
    (["QUEUED", "RETRY_WAIT"].includes(input.job.status) && input.job.availableAt <= input.now) ||
    (input.job.status === "RUNNING" && input.job.lockedAt !== null && input.job.lockedAt.getTime() <= staleLeaseAt);
  if (!claimable) throw new Error("RIOT_SYNC_NOT_CLAIMABLE");
  if (input.job.attemptCount >= input.job.maximumAttempts) throw new Error("RIOT_SYNC_ATTEMPTS_EXHAUSTED");
  return {
    ...input.job,
    revision: input.job.revision + 1,
    status: "RUNNING",
    attemptCount: input.job.attemptCount + 1,
    lockedAt: input.now,
    failureCode: null,
  };
}

export function finishRiotSyncJob(input: Readonly<{
  job: RiotSyncJob;
  expectedRevision: number;
  outcome: RiotSyncOutcome;
  now: Date;
}>): RiotSyncJob {
  expectedRevision(input.job.revision, input.expectedRevision);
  finiteDate(input.now, "INVALID_RIOT_SYNC_TIME");
  if (input.job.status !== "RUNNING" || !input.job.lockedAt) throw new Error("RIOT_SYNC_NOT_RUNNING");
  if (input.outcome.kind === "SUCCESS") {
    return { ...input.job, revision: input.job.revision + 1, status: input.outcome.partial ? "PARTIAL" : "SUCCEEDED", lockedAt: null, completedAt: input.now, failureCode: null };
  }
  const failureCode = input.outcome.kind === "RATE_LIMITED" ? "RATE_LIMITED" : input.outcome.code;
  const exhausted = input.job.attemptCount >= input.job.maximumAttempts;
  if (input.outcome.kind === "PERMANENT_FAILURE" || exhausted) {
    return { ...input.job, revision: input.job.revision + 1, status: "FAILED", lockedAt: null, completedAt: input.now, failureCode };
  }
  const retrySeconds = input.outcome.kind === "RATE_LIMITED"
    ? Math.min(3_600, Math.max(1, Math.ceil(input.outcome.retryAfterSeconds)))
    : Math.min(300, 2 ** input.job.attemptCount * 5);
  return {
    ...input.job,
    revision: input.job.revision + 1,
    status: "RETRY_WAIT",
    availableAt: new Date(input.now.getTime() + retrySeconds * 1_000),
    lockedAt: null,
    completedAt: null,
    failureCode,
  };
}

/** Public projection deliberately omits PUUID, link owner and request logs. */
export function toPublicRiotSummaryDto(projection: RiotSummaryProjection): PublicRiotSummaryDto {
  const riotId = canonicalRiotId(projection);
  return {
    playerId: projection.playerId,
    riotId: `${riotId.gameName}#${riotId.tagLine}`,
    soloTier: projection.soloTier,
    soloRank: projection.soloRank,
    leaguePoints: projection.leaguePoints,
    wins: projection.wins,
    losses: projection.losses,
    lastSyncedAt: projection.lastSyncedAt?.toISOString() ?? null,
  };
}
