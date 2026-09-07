import assert from "node:assert/strict";
import test from "node:test";

import {
  FakeRiotGateway,
  FakeRiotIdentityProtector,
  FakeRsoAdapter,
  RiotApplicationError,
  RiotApplicationService,
  type CurrentRiotActor,
  type RiotAccountLink,
  type RiotApplicationDependencies,
  type RiotAuditEvent,
  type RiotCommandContext,
  type RiotCommandReceipt,
  type RiotOutboxEvent,
  type RiotProjectionUpdate,
  type RiotReceiptIdentity,
  type RiotRsoState,
  type RiotSyncJob,
  type RiotTransaction,
} from "../src/modules/riot";

const initialNow = new Date("2026-09-07T08:00:00.000Z");

type Snapshot = {
  links: Map<string, RiotAccountLink>;
  states: Map<string, RiotRsoState>;
  jobs: Map<string, RiotSyncJob>;
  receipts: Map<string, RiotCommandReceipt>;
  audits: RiotAuditEvent[];
  outbox: RiotOutboxEvent[];
  projections: RiotProjectionUpdate[];
};

function same(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

class Harness {
  snapshot: Snapshot = { links: new Map(), states: new Map(), jobs: new Map(), receipts: new Map(), audits: [], outbox: [], projections: [] };
  now = new Date(initialNow);
  enabled = true;
  inTransaction = false;
  failOutbox = false;
  externalInsideTransaction = false;
  actors = new Map<string, CurrentRiotActor>();
  private serial = 0;

  readonly gateway = new FakeRiotGateway();
  readonly rso = new FakeRsoAdapter();
  readonly protector = new FakeRiotIdentityProtector();

  context(principalId: string, intent: RiotCommandContext["authorizationIntent"], key: string): RiotCommandContext {
    return {
      principalId,
      requestId: `request-${key}`,
      issuedAt: this.now.toISOString(),
      authorizationIntent: intent,
      idempotencyKeyMaterial: new TextEncoder().encode(`riot-idempotency-${key}`),
      bodyDigestHex: "a".repeat(64),
    };
  }

  ownerContext(key: string, principalId = "owner-principal") {
    return this.context(principalId, { kind: "OWNER_SESSION", sessionId: `session-${principalId}`, role: "USER", authVersion: 0, transactionRecheck: true }, key);
  }

  adminContext(key: string, superAdmin = false) {
    return this.context(superAdmin ? "super-principal" : "admin-principal", {
      kind: "ADMIN_TOTP",
      sessionId: superAdmin ? "super-session" : "admin-session",
      role: superAdmin ? "SUPER_ADMIN" : "ADMIN",
      authVersion: 0,
      minimumRole: superAdmin ? "SUPER_ADMIN" : "ADMIN",
      requireTotp: true,
      transactionRecheck: true,
    }, key);
  }

  jobAuthorization() {
    return {
      principalId: "job-principal",
      authorizationIntent: {
        kind: "SIGNED_JOB" as const,
        jobName: "riot-sync" as const,
        nonce: "job_nonce_123456789",
        timestampSeconds: Math.floor(this.now.getTime() / 1_000),
        bodyDigestHex: "b".repeat(64),
        signatureHex: "c".repeat(64),
        transactionRecheck: true as const,
      },
    };
  }

  service(): RiotApplicationService {
    const transaction = {} as RiotTransaction;
    const receiptKey = (identity: RiotReceiptIdentity) => `${identity.principalId}:${identity.scope}:${Buffer.from(identity.keyHash).toString("hex")}`;
    const assertTransaction = () => assert.equal(this.inTransaction, true, "port must run in transaction");
    const checkedExternal = <Arguments extends unknown[], Result>(operation: (...args: Arguments) => Promise<Result>) =>
      async (...args: Arguments): Promise<Result> => {
        if (this.inTransaction) this.externalInsideTransaction = true;
        return operation(...args);
      };

    const dependencies: RiotApplicationDependencies = {
      unitOfWork: {
        transaction: async <T>(operation: (current: RiotTransaction) => Promise<T>) => {
          assert.equal(this.inTransaction, false, "nested transaction is not supported by the contract fake");
          const before = structuredClone(this.snapshot);
          this.inTransaction = true;
          try {
            return await operation(transaction);
          } catch (error) {
            this.snapshot = before;
            throw error;
          } finally {
            this.inTransaction = false;
          }
        },
      },
      features: { isEnabled: async () => (assertTransaction(), this.enabled) },
      authorization: {
        recheck: async (_transaction, input) => {
          assertTransaction();
          return this.actors.get(input.principalId) ?? null;
        },
      },
      receipts: {
        inspect: async (_transaction, identity) => {
          assertTransaction();
          const receipt = this.snapshot.receipts.get(receiptKey(identity));
          if (!receipt) return { kind: "NONE" };
          return same(receipt.requestHash, identity.requestHash) && receipt.bodyDigestHex === identity.bodyDigestHex
            ? { kind: "REPLAY", receipt }
            : { kind: "MISMATCH" };
        },
        claim: async (_transaction, identity) => {
          assertTransaction();
          const receipt = this.snapshot.receipts.get(receiptKey(identity));
          if (!receipt) return { kind: "CLAIMED" };
          return same(receipt.requestHash, identity.requestHash) && receipt.bodyDigestHex === identity.bodyDigestHex
            ? { kind: "REPLAY", receipt }
            : { kind: "MISMATCH" };
        },
        complete: async (_transaction, receipt) => {
          assertTransaction();
          this.snapshot.receipts.set(receiptKey(receipt), structuredClone(receipt));
        },
      },
      repository: {
        loadPlayerOwnerAccountIdForUpdate: async (_transaction, playerId) => {
          assertTransaction();
          const owner = [...this.actors.values()].find(
            (actor): actor is Extract<CurrentRiotActor, { purpose: "ACCOUNT" }> =>
              actor.purpose === "ACCOUNT" && actor.playerId === playerId && actor.accountStatus === "APPROVED",
          );
          return owner?.userAccountId ?? null;
        },
        loadLinkForPlayerForUpdate: async (_transaction, playerId) => {
          assertTransaction();
          return [...this.snapshot.links.values()].find((link) => link.playerId === playerId) ?? null;
        },
        loadLinkForUpdate: async (_transaction, linkId) => (assertTransaction(), this.snapshot.links.get(linkId) ?? null),
        saveLink: async (_transaction, link) => {
          assertTransaction();
          this.snapshot.links.set(link.id, structuredClone(link));
        },
        loadRsoStateForUpdate: async (_transaction, digestHex) => {
          assertTransaction();
          return [...this.snapshot.states.values()].find((state) => state.stateDigestHex === digestHex) ?? null;
        },
        saveRsoState: async (_transaction, state) => {
          assertTransaction();
          this.snapshot.states.set(state.id, structuredClone(state));
        },
        latestSyncRequestedAt: async (_transaction, linkId) => {
          assertTransaction();
          const jobs = [...this.snapshot.jobs.values()].filter((job) => job.linkId === linkId).sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime());
          return jobs[0]?.requestedAt ?? null;
        },
        listConnectedLinksForUpdate: async (_transaction, linkIds) => {
          assertTransaction();
          return [...this.snapshot.links.values()].filter((link) => link.status === "CONNECTED" && (!linkIds || linkIds.includes(link.id)));
        },
        saveSyncJob: async (_transaction, job) => {
          assertTransaction();
          this.snapshot.jobs.set(job.id, structuredClone(job));
        },
        loadNextClaimableSyncJobForUpdate: async (_transaction, now) => {
          assertTransaction();
          return [...this.snapshot.jobs.values()]
            .filter((job) =>
              (["QUEUED", "RETRY_WAIT"].includes(job.status) && job.availableAt <= now) ||
              (job.status === "RUNNING" && job.lockedAt !== null && job.lockedAt.getTime() <= now.getTime() - 60_000))
            .sort((left, right) => left.availableAt.getTime() - right.availableAt.getTime() || left.id.localeCompare(right.id))[0] ?? null;
        },
        loadSyncJobForUpdate: async (_transaction, jobId) => (assertTransaction(), this.snapshot.jobs.get(jobId) ?? null),
        saveProjection: async (_transaction, projection) => {
          assertTransaction();
          this.snapshot.projections.push(structuredClone(projection));
        },
      },
      audit: {
        append: async (_transaction, event) => {
          assertTransaction();
          this.snapshot.audits.push(structuredClone(event));
        },
      },
      outbox: {
        append: async (_transaction, event) => {
          assertTransaction();
          if (this.failOutbox) throw new Error("OUTBOX_UNAVAILABLE");
          this.snapshot.outbox.push(structuredClone(event));
        },
      },
      clock: {
        now: () => new Date(this.now),
        receiptExpiresAt: (now) => new Date(now.getTime() + 24 * 60 * 60_000),
      },
      ids: { next: (kind) => `${kind.toLowerCase()}-${++this.serial}` },
      gateway: {
        resolveRiotId: checkedExternal((input) => this.gateway.resolveRiotId(input)),
        fetchRank: checkedExternal((input) => this.gateway.fetchRank(input)),
      },
      rso: {
        issueState: (stateId) => this.rso.issueState(stateId),
        digestState: (state) => this.rso.digestState(state),
        authorizationUrl: (input) => this.rso.authorizationUrl(input),
        exchangeOnce: checkedExternal((input) => this.rso.exchangeOnce(input)),
      },
      identityProtector: {
        protect: checkedExternal((puuid) => this.protector.protect(puuid)),
        reveal: checkedExternal((protectedPuuid) => this.protector.reveal(protectedPuuid)),
      },
    };
    return new RiotApplicationService(dependencies);
  }
}

function setup() {
  const harness = new Harness();
  harness.actors.set("owner-principal", { purpose: "ACCOUNT", principalId: "owner-principal", userAccountId: "account-1", playerId: "player-1", accountStatus: "APPROVED" });
  harness.actors.set("other-owner", { purpose: "ACCOUNT", principalId: "other-owner", userAccountId: "account-2", playerId: "player-2", accountStatus: "APPROVED" });
  harness.actors.set("admin-principal", { purpose: "ADMIN", principalId: "admin-principal", userAccountId: "admin-account", role: "ADMIN" });
  harness.actors.set("super-principal", { purpose: "ADMIN", principalId: "super-principal", userAccountId: "super-account", role: "SUPER_ADMIN" });
  harness.actors.set("job-principal", { purpose: "JOB", principalId: "job-principal", jobName: "riot-sync" });
  harness.gateway.registerIdentity({ gameName: "Ahri", tagLine: "KR1", puuid: "private-puuid-1" });
  return { harness, service: harness.service() };
}

test("approved owner direct link/unlink is transactional, idempotent, and never leaks PUUID", async () => {
  const { harness, service } = setup();
  const context = harness.ownerContext("connect");
  const first = await service.connectDirect({ context, playerId: "player-1", expectedRevision: 0, gameName: "Ahri", tagLine: "KR1" });
  const replay = await service.connectDirect({ context, playerId: "player-1", expectedRevision: 0, gameName: "Ahri", tagLine: "KR1" });
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(harness.snapshot.links.size, 1);
  assert.equal(harness.externalInsideTransaction, false);
  const durableSafeData = JSON.stringify({ receipts: [...harness.snapshot.receipts.values()], audits: harness.snapshot.audits, outbox: harness.snapshot.outbox });
  assert.equal(durableSafeData.includes("private-puuid-1"), false);
  assert.equal(durableSafeData.includes("puuidCiphertext"), false);

  const disconnected = await service.disconnect({ context: harness.ownerContext("disconnect"), playerId: "player-1", expectedRevision: 0 });
  assert.equal(disconnected.body.status, "DISCONNECTED");
  assert.equal([...harness.snapshot.links.values()][0]?.puuidCiphertext, null);
});

test("feature flag fails closed and outbox failure rolls link, audit, and receipt back together", async () => {
  const { harness, service } = setup();
  harness.enabled = false;
  await assert.rejects(
    service.connectDirect({ context: harness.ownerContext("disabled"), playerId: "player-1", expectedRevision: 0, gameName: "Ahri", tagLine: "KR1" }),
    (error: unknown) => error instanceof RiotApplicationError && error.code === "FEATURE_DISABLED",
  );
  assert.equal(harness.snapshot.links.size, 0);

  harness.enabled = true;
  harness.failOutbox = true;
  await assert.rejects(service.connectDirect({ context: harness.ownerContext("rollback"), playerId: "player-1", expectedRevision: 0, gameName: "Ahri", tagLine: "KR1" }), /OUTBOX_UNAVAILABLE/);
  assert.equal(harness.snapshot.links.size, 0);
  assert.equal(harness.snapshot.audits.length, 0);
  assert.equal(harness.snapshot.receipts.size, 0);
});

test("RSO callback is internal-return, expiring, one-time and exchange-idempotent across response replay", async () => {
  const { harness, service } = setup();
  harness.rso.registerCallback("short-lived-code", { gameName: "Ahri", tagLine: "KR1", puuid: "rso-private-puuid" });
  const started = await service.startRso({ context: harness.ownerContext("rso-start"), returnTo: "https://evil.test/steal" });
  assert.equal(started.returnTo, "/account/riot");
  const state = new URL(started.authorizationUrl).searchParams.get("state");
  assert.ok(state);
  const context = harness.ownerContext("rso-callback");
  harness.failOutbox = true;
  await assert.rejects(
    service.completeRso({ context, playerId: "player-1", expectedRevision: 0, publicState: state, authorizationCode: "short-lived-code" }),
    /OUTBOX_UNAVAILABLE/,
  );
  assert.equal(harness.rso.exchangeCalls, 1);
  assert.equal([...harness.snapshot.states.values()][0]?.consumedAt, null);
  harness.failOutbox = false;
  const completed = await service.completeRso({ context, playerId: "player-1", expectedRevision: 0, publicState: state, authorizationCode: "short-lived-code" });
  const replay = await service.completeRso({ context, playerId: "player-1", expectedRevision: 0, publicState: state, authorizationCode: "short-lived-code" });
  assert.equal(completed.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(harness.rso.exchangeCalls, 1);
  assert.ok([...harness.snapshot.states.values()][0]?.consumedAt);
  const durableSafeData = JSON.stringify({ receipts: [...harness.snapshot.receipts.values()], audits: harness.snapshot.audits, outbox: harness.snapshot.outbox });
  assert.equal(durableSafeData.includes("short-lived-code"), false);
  assert.equal(durableSafeData.includes("rso-private-puuid"), false);
});

test("only SUPER_ADMIN can bulk/sync-all while owner is restricted to the owned link", async () => {
  const { harness, service } = setup();
  await service.connectDirect({ context: harness.ownerContext("owner-link"), playerId: "player-1", expectedRevision: 0, gameName: "Ahri", tagLine: "KR1" });
  const linkId = [...harness.snapshot.links.keys()][0]!;
  harness.gateway.registerIdentity({ gameName: "Lux", tagLine: "KR2", puuid: "private-puuid-2" });
  const adminLinked = await service.connectDirect({ context: harness.adminContext("admin-link"), playerId: "player-2", expectedRevision: 0, gameName: "Lux", tagLine: "KR2" });
  assert.equal(adminLinked.body.method, "ADMIN");
  await assert.rejects(
    service.requestSync({ context: harness.adminContext("admin-bulk"), mode: "BULK", linkIds: [linkId] }),
    (error: unknown) => error instanceof RiotApplicationError && error.code === "FORBIDDEN",
  );
  const queued = await service.requestSync({ context: harness.adminContext("super-all", true), mode: "ALL" });
  assert.equal(queued.body.queuedCount, 2);
  await assert.rejects(
    service.requestSync({ context: harness.ownerContext("wrong-owner", "other-owner"), mode: "SINGLE", linkIds: [linkId] }),
    (error: unknown) => error instanceof RiotApplicationError && error.code === "NOT_FOUND",
  );
});

test("sync enforces cooldown, Retry-After, stale lease recovery and partial completion", async () => {
  const { harness, service } = setup();
  await service.connectDirect({ context: harness.ownerContext("sync-link"), playerId: "player-1", expectedRevision: 0, gameName: "Ahri", tagLine: "KR1" });
  const linkId = [...harness.snapshot.links.keys()][0]!;
  await service.requestSync({ context: harness.ownerContext("sync-request"), mode: "SINGLE", linkIds: [linkId] });
  await assert.rejects(
    service.requestSync({ context: harness.ownerContext("sync-too-soon"), mode: "SINGLE", linkIds: [linkId] }),
    (error: unknown) => error instanceof RiotApplicationError && error.code === "SYNC_COOLDOWN" && error.retryAfterSeconds === 300,
  );

  harness.gateway.registerFailure("private-puuid-1", { kind: "RATE_LIMITED", retryAfterSeconds: 120 });
  await service.runNextSync(harness.jobAuthorization());
  let job = [...harness.snapshot.jobs.values()][0]!;
  assert.equal(job.status, "RETRY_WAIT");
  assert.equal(job.availableAt.getTime(), harness.now.getTime() + 120_000);

  harness.now = new Date(job.availableAt);
  harness.gateway.registerRank("private-puuid-1", { tier: "DIAMOND", rank: "I", leaguePoints: 50, wins: 10, losses: null, partial: true });
  await service.runNextSync(harness.jobAuthorization());
  job = [...harness.snapshot.jobs.values()][0]!;
  assert.equal(job.status, "PARTIAL");
  assert.equal(harness.snapshot.projections.length, 1);
  assert.equal(harness.externalInsideTransaction, false);
});
