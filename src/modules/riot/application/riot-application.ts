import {
  assertRiotSyncCooldown,
  canonicalRiotId,
  claimRiotSyncJob,
  claimRsoStateExchange,
  completeRsoStateExchange,
  connectRiotAccount,
  createRiotSyncJob,
  createRsoState,
  disconnectRiotAccount,
  finishRiotSyncJob,
  safeRsoReturnTo,
  type RiotAccountLink,
  type RiotSyncOutcome,
} from "../domain/riot-integration";
import { riotReceiptIdentity, type RiotCommandContext } from "./commands";
import type {
  CurrentRiotActor,
  RiotAction,
  RiotAuditPort,
  RiotAuthorizationPort,
  RiotClockPort,
  RiotCommandReceipt,
  RiotFeatureFlagPort,
  RiotGatewayPort,
  RiotIdPort,
  RiotIdentityProtectorPort,
  RiotOutboxPort,
  RiotReceiptIdentity,
  RiotReceiptPort,
  RiotRepository,
  RiotRankSnapshot,
  RiotRsoPort,
  RiotSafeBody,
  RiotTransaction,
  RiotUnitOfWork,
} from "./ports";

export class RiotApplicationError extends Error {
  constructor(
    readonly code:
      | "FEATURE_DISABLED"
      | "INVALID_COMMAND"
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "IDEMPOTENCY_MISMATCH"
      | "SYNC_COOLDOWN"
      | "NO_WORK",
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "RiotApplicationError";
  }
}

export type RiotApplicationDependencies = Readonly<{
  unitOfWork: RiotUnitOfWork;
  features: RiotFeatureFlagPort;
  authorization: RiotAuthorizationPort;
  receipts: RiotReceiptPort;
  repository: RiotRepository;
  audit: RiotAuditPort;
  outbox: RiotOutboxPort;
  clock: RiotClockPort;
  ids: RiotIdPort;
  gateway: RiotGatewayPort;
  rso: RiotRsoPort;
  identityProtector: RiotIdentityProtectorPort;
}>;

export type RiotMutationResult = Readonly<{ body: RiotSafeBody; replayed: boolean }>;

function identifier(value: string, label: string): string {
  if (!value || value !== value.trim() || value.length > 200) {
    throw new RiotApplicationError("INVALID_COMMAND", `${label} is invalid.`);
  }
  return value;
}

function instant(value: string): void {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new RiotApplicationError("INVALID_COMMAND", "issuedAt must be a canonical ISO instant.");
  }
}

function roleAtLeast(actual: "ADMIN" | "SUPER_ADMIN", expected: "ADMIN" | "SUPER_ADMIN") {
  return expected === "ADMIN" || actual === "SUPER_ADMIN";
}

function linkSnapshot(link: RiotAccountLink | null): RiotSafeBody {
  if (!link) return { status: "MISSING" };
  return {
    linkId: link.id,
    playerId: link.playerId,
    revision: link.revision,
    riotId: `${link.gameName}#${link.tagLine}`,
    method: link.method,
    status: link.status,
  };
}

function jobSnapshot(job: Readonly<{
  id: string;
  linkId: string;
  revision: number;
  status: string;
  attemptCount: number;
  failureCode: string | null;
}>): RiotSafeBody {
  return {
    jobId: job.id,
    linkId: job.linkId,
    revision: job.revision,
    status: job.status,
    attemptCount: job.attemptCount,
    failureCode: job.failureCode,
  };
}

function validateContext(context: RiotCommandContext): void {
  identifier(context.principalId, "principalId");
  identifier(context.requestId, "requestId");
  instant(context.issuedAt);
  if (context.authorizationIntent.transactionRecheck !== true) {
    throw new RiotApplicationError("INVALID_COMMAND", "Authorization must be rechecked in the transaction.");
  }
  const intent = context.authorizationIntent;
  if (intent.kind === "OWNER_SESSION") {
    identifier(intent.sessionId, "sessionId");
  } else if (intent.kind === "ADMIN_TOTP") {
    identifier(intent.sessionId, "sessionId");
    if (intent.requireTotp !== true || !["ADMIN", "SUPER_ADMIN"].includes(intent.minimumRole)) {
      throw new RiotApplicationError("INVALID_COMMAND", "ADMIN-purpose TOTP authorization is invalid.");
    }
  } else if (
    intent.jobName !== "riot-sync" ||
    !/^[A-Za-z0-9_-]{16,100}$/u.test(intent.nonce) ||
    !Number.isSafeInteger(intent.timestampSeconds) ||
    intent.timestampSeconds < 0 ||
    !/^[a-f0-9]{64}$/u.test(intent.bodyDigestHex)
  ) {
    throw new RiotApplicationError("INVALID_COMMAND", "Signed JOB authorization is invalid.");
  }
}

export class RiotApplicationService {
  constructor(private readonly dependencies: RiotApplicationDependencies) {}

  async connectDirect(input: Readonly<{
    context: RiotCommandContext;
    playerId: string;
    expectedRevision: number;
    gameName: string;
    tagLine: string;
  }>): Promise<RiotMutationResult> {
    validateContext(input.context);
    identifier(input.playerId, "playerId");
    const riotId = canonicalRiotId(input);
    const identity = riotReceiptIdentity(input.context, "riot:link:direct", {
      action: "CONNECT_DIRECT",
      playerId: input.playerId,
      expectedRevision: input.expectedRevision,
      riotId: riotId.normalizedKey,
    });
    const replay = await this.preflight(input.context, identity, "CONNECT_DIRECT", input.playerId);
    if (replay) return { body: replay.body, replayed: true };

    const resolved = await this.dependencies.gateway.resolveRiotId(riotId);
    const resolvedId = canonicalRiotId(resolved);
    if (resolvedId.normalizedKey !== riotId.normalizedKey) {
      throw new RiotApplicationError("NOT_FOUND", "Riot account is not available.");
    }
    const protectedPuuid = await this.dependencies.identityProtector.protect(resolved.puuid);

    return this.dependencies.unitOfWork.transaction(async (transaction) => {
      const actor = await this.authorize(transaction, input.context, "CONNECT_DIRECT", input.playerId);
      const claim = await this.claim(transaction, identity);
      if (claim) return { body: claim.body, replayed: true };
      const current = await this.dependencies.repository.loadLinkForPlayerForUpdate(transaction, input.playerId);
      const ownerAccountId = actor.purpose === "ACCOUNT" ? actor.userAccountId : current?.ownerAccountId;
      if (!ownerAccountId) throw new RiotApplicationError("NOT_FOUND", "Player ownership is not available.");
      const next = connectRiotAccount({
        current,
        id: current?.id ?? this.dependencies.ids.next("LINK"),
        expectedRevision: input.expectedRevision,
        playerId: input.playerId,
        ownerAccountId,
        gameName: resolvedId.gameName,
        tagLine: resolvedId.tagLine,
        puuidCiphertext: protectedPuuid,
        method: actor.purpose === "ACCOUNT" ? "DIRECT_OWNER" : "ADMIN",
        now: this.now(),
      });
      await this.dependencies.repository.saveLink(transaction, next, input.expectedRevision);
      const body = linkSnapshot(next);
      await this.record(transaction, input.context, identity, actor, "CONNECT_DIRECT", next.id, next.revision, linkSnapshot(current), body);
      return { body, replayed: false };
    });
  }

  async disconnect(input: Readonly<{
    context: RiotCommandContext;
    playerId: string;
    expectedRevision: number;
  }>): Promise<RiotMutationResult> {
    validateContext(input.context);
    const identity = riotReceiptIdentity(input.context, "riot:link:disconnect", {
      action: "DISCONNECT",
      playerId: input.playerId,
      expectedRevision: input.expectedRevision,
    });
    return this.dependencies.unitOfWork.transaction(async (transaction) => {
      const actor = await this.authorize(transaction, input.context, "DISCONNECT", input.playerId);
      const replay = await this.claim(transaction, identity);
      if (replay) return { body: replay.body, replayed: true };
      const current = await this.dependencies.repository.loadLinkForPlayerForUpdate(transaction, input.playerId);
      if (!current) throw new RiotApplicationError("NOT_FOUND", "Riot link is not available.");
      if (actor.purpose === "ACCOUNT" && current.ownerAccountId !== actor.userAccountId) {
        throw new RiotApplicationError("NOT_FOUND", "Riot link is not available.");
      }
      const next = disconnectRiotAccount({
        link: current,
        expectedRevision: input.expectedRevision,
        ownerAccountId: actor.purpose === "ACCOUNT" ? actor.userAccountId : current.ownerAccountId,
        actor: actor.purpose === "ACCOUNT" ? "OWNER" : "ADMIN",
        now: this.now(),
      });
      await this.dependencies.repository.saveLink(transaction, next, input.expectedRevision);
      const body = linkSnapshot(next);
      await this.record(transaction, input.context, identity, actor, "DISCONNECT", next.id, next.revision, linkSnapshot(current), body);
      return { body, replayed: false };
    });
  }

  async startRso(input: Readonly<{ context: RiotCommandContext; returnTo?: string | null }>): Promise<
    RiotMutationResult & Readonly<{ authorizationUrl: string; returnTo: string }>
  > {
    validateContext(input.context);
    const returnTo = safeRsoReturnTo(input.returnTo);
    const identity = riotReceiptIdentity(input.context, "riot:rso:start", { action: "RSO_START", returnTo });
    const result = await this.dependencies.unitOfWork.transaction(async (transaction) => {
      const actor = await this.authorize(transaction, input.context, "RSO_START");
      if (actor.purpose !== "ACCOUNT") throw new RiotApplicationError("FORBIDDEN", "Owner authorization is required.");
      const replay = await this.claim(transaction, identity);
      if (replay) return { body: replay.body, replayed: true };
      const stateId = this.dependencies.ids.next("RSO_STATE");
      const issued = this.dependencies.rso.issueState(stateId);
      const state = createRsoState({
        id: stateId,
        ownerAccountId: actor.userAccountId,
        stateDigestHex: issued.digestHex,
        returnTo,
        now: this.now(),
      });
      await this.dependencies.repository.saveRsoState(transaction, state);
      const body: RiotSafeBody = { stateId, returnTo: state.returnTo, expiresAt: state.expiresAt.toISOString() };
      await this.record(transaction, input.context, identity, actor, "RSO_START", state.id, 0, { status: "MISSING" }, body);
      return { body, replayed: false };
    });
    const stateId = String(result.body.stateId);
    const issued = this.dependencies.rso.issueState(stateId);
    return {
      ...result,
      authorizationUrl: this.dependencies.rso.authorizationUrl({ publicState: issued.publicState }),
      returnTo: String(result.body.returnTo),
    };
  }

  async completeRso(input: Readonly<{
    context: RiotCommandContext;
    playerId: string;
    expectedRevision: number;
    publicState: string;
    authorizationCode: string;
  }>): Promise<RiotMutationResult> {
    validateContext(input.context);
    if (!input.publicState || input.publicState.length > 1_000 || !input.authorizationCode || input.authorizationCode.length > 2_000) {
      throw new RiotApplicationError("INVALID_COMMAND", "RSO callback is invalid.");
    }
    const stateDigestHex = this.dependencies.rso.digestState(input.publicState);
    const identity = riotReceiptIdentity(input.context, "riot:rso:callback", {
      action: "RSO_CALLBACK",
      playerId: input.playerId,
      expectedRevision: input.expectedRevision,
      stateDigestHex,
    });
    const prepared = await this.dependencies.unitOfWork.transaction(async (transaction) => {
      const actor = await this.authorize(transaction, input.context, "RSO_CALLBACK", input.playerId);
      if (actor.purpose !== "ACCOUNT") throw new RiotApplicationError("FORBIDDEN", "Owner authorization is required.");
      const inspection = await this.dependencies.receipts.inspect(transaction, identity);
      if (inspection.kind === "MISMATCH") throw new RiotApplicationError("IDEMPOTENCY_MISMATCH", "Idempotency key was reused.");
      if (inspection.kind === "REPLAY") return { replay: inspection.receipt } as const;
      const current = await this.dependencies.repository.loadRsoStateForUpdate(transaction, stateDigestHex);
      if (!current) throw new RiotApplicationError("NOT_FOUND", "RSO state is not available.");
      const state = claimRsoStateExchange({
        state: current,
        ownerAccountId: actor.userAccountId,
        presentedDigestHex: stateDigestHex,
        exchangeId: current.id,
        now: this.now(),
      });
      await this.dependencies.repository.saveRsoState(transaction, state);
      return { stateId: state.id } as const;
    });
    if ("replay" in prepared && prepared.replay) return { body: prepared.replay.body, replayed: true };

    const resolved = await this.dependencies.rso.exchangeOnce({
      exchangeId: prepared.stateId,
      authorizationCode: input.authorizationCode,
    });
    const riotId = canonicalRiotId(resolved);
    const protectedPuuid = await this.dependencies.identityProtector.protect(resolved.puuid);

    return this.dependencies.unitOfWork.transaction(async (transaction) => {
      const actor = await this.authorize(transaction, input.context, "RSO_CALLBACK", input.playerId);
      if (actor.purpose !== "ACCOUNT") throw new RiotApplicationError("FORBIDDEN", "Owner authorization is required.");
      const replay = await this.claim(transaction, identity);
      if (replay) return { body: replay.body, replayed: true };
      const stateCurrent = await this.dependencies.repository.loadRsoStateForUpdate(transaction, stateDigestHex);
      if (!stateCurrent) throw new RiotApplicationError("NOT_FOUND", "RSO state is not available.");
      const state = completeRsoStateExchange({ state: stateCurrent, exchangeId: prepared.stateId, now: this.now() });
      const current = await this.dependencies.repository.loadLinkForPlayerForUpdate(transaction, input.playerId);
      const next = connectRiotAccount({
        current,
        id: current?.id ?? this.dependencies.ids.next("LINK"),
        expectedRevision: input.expectedRevision,
        playerId: input.playerId,
        ownerAccountId: actor.userAccountId,
        gameName: riotId.gameName,
        tagLine: riotId.tagLine,
        puuidCiphertext: protectedPuuid,
        method: "RSO_VERIFIED",
        now: this.now(),
      });
      await this.dependencies.repository.saveRsoState(transaction, state);
      await this.dependencies.repository.saveLink(transaction, next, input.expectedRevision);
      const body = linkSnapshot(next);
      await this.record(transaction, input.context, identity, actor, "RSO_CALLBACK", next.id, next.revision, linkSnapshot(current), body);
      return { body, replayed: false };
    });
  }

  async requestSync(input: Readonly<{
    context: RiotCommandContext;
    mode: "SINGLE" | "BULK" | "ALL";
    linkIds?: readonly string[];
    cooldownMilliseconds?: number;
  }>): Promise<RiotMutationResult> {
    validateContext(input.context);
    const linkIds = input.mode === "ALL" ? null : [...new Set(input.linkIds ?? [])].sort();
    if ((input.mode === "SINGLE" && linkIds?.length !== 1) || (input.mode === "BULK" && (!linkIds?.length || linkIds.length > 50))) {
      throw new RiotApplicationError("INVALID_COMMAND", "Sync target selection is invalid.");
    }
    const action: RiotAction = input.mode === "SINGLE" ? "REQUEST_SYNC" : input.mode === "BULK" ? "REQUEST_SYNC_BULK" : "REQUEST_SYNC_ALL";
    const identity = riotReceiptIdentity(input.context, `riot:sync:${input.mode.toLowerCase()}`, { action, linkIds });
    return this.dependencies.unitOfWork.transaction(async (transaction) => {
      const actor = await this.authorize(transaction, input.context, action, undefined, input.mode !== "SINGLE");
      const replay = await this.claim(transaction, identity);
      if (replay) return { body: replay.body, replayed: true };
      const links = await this.dependencies.repository.listConnectedLinksForUpdate(transaction, linkIds);
      if (!links.length || (linkIds && links.length !== linkIds.length)) {
        throw new RiotApplicationError("NOT_FOUND", "Sync targets are not available.");
      }
      if (actor.purpose === "ACCOUNT" && (links.length !== 1 || links[0]?.ownerAccountId !== actor.userAccountId)) {
        throw new RiotApplicationError("NOT_FOUND", "Sync target is not available.");
      }
      const now = this.now();
      const jobIds: string[] = [];
      for (const link of links) {
        try {
          assertRiotSyncCooldown({
            lastRequestedAt: await this.dependencies.repository.latestSyncRequestedAt(transaction, link.id),
            now,
            cooldownMilliseconds: input.cooldownMilliseconds,
          });
        } catch (error) {
          const match = error instanceof Error ? /^RIOT_SYNC_COOLDOWN:(\d+)$/u.exec(error.message) : null;
          if (match) throw new RiotApplicationError("SYNC_COOLDOWN", "Riot sync is cooling down.", Number(match[1]));
          throw error;
        }
        const job = createRiotSyncJob({
          id: this.dependencies.ids.next("SYNC_JOB"),
          linkId: link.id,
          requestedBy: actor.purpose === "ACCOUNT" ? "OWNER" : actor.purpose === "ADMIN" ? actor.role : "JOB",
          now,
        });
        await this.dependencies.repository.saveSyncJob(transaction, job);
        jobIds.push(job.id);
      }
      const body: RiotSafeBody = { mode: input.mode, jobIds, queuedCount: jobIds.length };
      await this.record(transaction, input.context, identity, actor, action, jobIds[0]!, 0, { status: "MISSING" }, body);
      return { body, replayed: false };
    });
  }

  async runNextSync(input: Readonly<{
    principalId: string;
    authorizationIntent: Extract<import("./ports").RiotAuthorizationIntent, { kind: "SIGNED_JOB" }>;
  }>): Promise<Readonly<{ status: "IDLE" } | { status: "PROCESSED"; body: RiotSafeBody }>> {
    const claimed = await this.dependencies.unitOfWork.transaction(async (transaction) => {
      const actor = await this.authorizeRaw(transaction, input.principalId, input.authorizationIntent, "CLAIM_SYNC");
      const now = this.now();
      const job = await this.dependencies.repository.loadNextClaimableSyncJobForUpdate(transaction, now);
      if (!job) return null;
      const link = await this.dependencies.repository.loadLinkForUpdate(transaction, job.linkId);
      if (!link || link.status !== "CONNECTED" || !link.puuidCiphertext) {
        throw new RiotApplicationError("NOT_FOUND", "Sync link is not available.");
      }
      const leaseId = this.dependencies.ids.next("LEASE");
      const next = claimRiotSyncJob({ job, expectedRevision: job.revision, leaseId, now });
      await this.dependencies.repository.saveSyncJob(transaction, next);
      await this.recordJob(transaction, input.principalId, actor, "CLAIM_SYNC", jobSnapshot(job), jobSnapshot(next), next);
      return { job: next, link, leaseId };
    });
    if (!claimed) return { status: "IDLE" };

    let outcome: RiotSyncOutcome;
    let snapshot: RiotRankSnapshot | undefined;
    try {
      const puuid = await this.dependencies.identityProtector.reveal(claimed.link.puuidCiphertext!);
      const result = await this.dependencies.gateway.fetchRank({ puuid });
      outcome = result.outcome;
      snapshot = "snapshot" in result ? result.snapshot : undefined;
    } catch {
      outcome = { kind: "TRANSIENT_FAILURE", code: "NETWORK" };
      snapshot = undefined;
    }

    const body = await this.dependencies.unitOfWork.transaction(async (transaction) => {
      const actor = await this.authorizeRaw(transaction, input.principalId, input.authorizationIntent, "FINISH_SYNC");
      const current = await this.dependencies.repository.loadSyncJobForUpdate(transaction, claimed.job.id);
      if (!current) throw new RiotApplicationError("NOT_FOUND", "Sync job is not available.");
      const next = finishRiotSyncJob({
        job: current,
        expectedRevision: current.revision,
        expectedLeaseId: claimed.leaseId,
        outcome,
        now: this.now(),
      });
      if (outcome.kind === "SUCCESS" && snapshot) {
        await this.dependencies.repository.saveProjection(transaction, {
          playerId: claimed.link.playerId,
          gameName: claimed.link.gameName,
          tagLine: claimed.link.tagLine,
          soloTier: snapshot.tier,
          soloRank: snapshot.rank,
          leaguePoints: snapshot.leaguePoints,
          wins: snapshot.wins,
          losses: snapshot.losses,
          syncedAt: this.now(),
        });
      }
      await this.dependencies.repository.saveSyncJob(transaction, next);
      await this.recordJob(transaction, input.principalId, actor, "FINISH_SYNC", jobSnapshot(current), jobSnapshot(next), next);
      return jobSnapshot(next);
    });
    return { status: "PROCESSED", body };
  }

  private now(): Date {
    const now = this.dependencies.clock.now();
    if (!Number.isFinite(now.getTime())) throw new RiotApplicationError("INVALID_COMMAND", "Clock returned an invalid time.");
    return now;
  }

  private async preflight(
    context: RiotCommandContext,
    identity: RiotReceiptIdentity,
    action: RiotAction,
    playerId?: string,
  ): Promise<RiotCommandReceipt | null> {
    return this.dependencies.unitOfWork.transaction(async (transaction) => {
      await this.authorize(transaction, context, action, playerId);
      const inspection = await this.dependencies.receipts.inspect(transaction, identity);
      if (inspection.kind === "MISMATCH") throw new RiotApplicationError("IDEMPOTENCY_MISMATCH", "Idempotency key was reused.");
      return inspection.kind === "REPLAY" ? inspection.receipt : null;
    });
  }

  private async authorize(
    transaction: RiotTransaction,
    context: RiotCommandContext,
    action: RiotAction,
    playerId?: string,
    requireSuper = false,
  ): Promise<CurrentRiotActor> {
    return this.authorizeRaw(transaction, context.principalId, context.authorizationIntent, action, requireSuper, playerId);
  }

  private async authorizeRaw(
    transaction: RiotTransaction,
    principalId: string,
    intent: import("./ports").RiotAuthorizationIntent,
    action: RiotAction,
    requireSuper = false,
    playerId?: string,
  ): Promise<CurrentRiotActor> {
    if (!(await this.dependencies.features.isEnabled(transaction))) {
      throw new RiotApplicationError("FEATURE_DISABLED", "Riot integration is disabled.");
    }
    const actor = await this.dependencies.authorization.recheck(transaction, { principalId, action, intent });
    if (!actor || actor.principalId !== principalId) throw new RiotApplicationError("NOT_FOUND", "Riot resource is not available.");
    if (intent.kind === "OWNER_SESSION") {
      if (actor.purpose !== "ACCOUNT" || actor.accountStatus !== "APPROVED" || (playerId && actor.playerId !== playerId)) {
        throw new RiotApplicationError("NOT_FOUND", "Riot resource is not available.");
      }
    } else if (intent.kind === "ADMIN_TOTP") {
      if (
        actor.purpose !== "ADMIN" ||
        intent.requireTotp !== true ||
        !roleAtLeast(actor.role, intent.minimumRole) ||
        (requireSuper && actor.role !== "SUPER_ADMIN")
      ) throw new RiotApplicationError("FORBIDDEN", "Administrative Riot permission is required.");
    } else if (actor.purpose !== "JOB" || actor.jobName !== "riot-sync" || !["CLAIM_SYNC", "FINISH_SYNC"].includes(action)) {
      throw new RiotApplicationError("FORBIDDEN", "Riot sync job authorization is required.");
    }
    if (requireSuper && actor.purpose !== "ADMIN") throw new RiotApplicationError("FORBIDDEN", "SUPER_ADMIN is required.");
    return actor;
  }

  private async claim(transaction: RiotTransaction, identity: RiotReceiptIdentity): Promise<RiotCommandReceipt | null> {
    const claim = await this.dependencies.receipts.claim(transaction, identity);
    if (claim.kind === "MISMATCH") throw new RiotApplicationError("IDEMPOTENCY_MISMATCH", "Idempotency key was reused.");
    return claim.kind === "REPLAY" ? claim.receipt : null;
  }

  private async record(
    transaction: RiotTransaction,
    context: RiotCommandContext,
    identity: RiotReceiptIdentity,
    actor: CurrentRiotActor,
    action: RiotAction,
    targetId: string,
    revision: number,
    before: RiotSafeBody,
    after: RiotSafeBody,
  ): Promise<void> {
    const occurredAt = this.now().toISOString();
    await this.dependencies.audit.append(transaction, {
      requestId: context.requestId,
      actorPrincipalId: actor.principalId,
      action: `RIOT_${action}`,
      targetId,
      before,
      after,
      occurredAt,
    });
    await this.dependencies.outbox.append(transaction, {
      id: this.dependencies.ids.next("OUTBOX"),
      requestId: context.requestId,
      aggregateId: targetId,
      aggregateRevision: revision,
      eventType: `RIOT_${action}`,
      dedupeKey: `${targetId}:${revision}:${action}`,
      payload: after,
      occurredAt,
    });
    const expiresAt = this.dependencies.clock.receiptExpiresAt(new Date(occurredAt));
    await this.dependencies.receipts.complete(transaction, {
      ...identity,
      body: after,
      createdAt: occurredAt,
      expiresAt: expiresAt.toISOString(),
    });
  }

  private async recordJob(
    transaction: RiotTransaction,
    principalId: string,
    actor: CurrentRiotActor,
    action: "CLAIM_SYNC" | "FINISH_SYNC",
    before: RiotSafeBody,
    after: RiotSafeBody,
    job: Readonly<{ id: string; revision: number }>,
  ): Promise<void> {
    const occurredAt = this.now().toISOString();
    const requestId = `${principalId}:${job.id}:${job.revision}:${action}`;
    await this.dependencies.audit.append(transaction, {
      requestId,
      actorPrincipalId: actor.principalId,
      action: `RIOT_${action}`,
      targetId: job.id,
      before,
      after,
      occurredAt,
    });
    await this.dependencies.outbox.append(transaction, {
      id: this.dependencies.ids.next("OUTBOX"),
      requestId,
      aggregateId: job.id,
      aggregateRevision: job.revision,
      eventType: `RIOT_${action}`,
      dedupeKey: `${job.id}:${job.revision}:${action}`,
      payload: after,
      occurredAt,
    });
  }
}
