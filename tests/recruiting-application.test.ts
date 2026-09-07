import assert from "node:assert/strict";
import test from "node:test";

import {
  hashRecruitingRequestKey,
  recruitingCommandRequestFingerprint,
  RecruitingApplicationError,
  RecruitingCommandHandler,
  toPublicPartyDto,
  toPublicScrimDto,
  type RecruitCommandReceipt,
  type RecruitingAuditEvent,
  type RecruitingCommand,
  type RecruitingCommandHandlerDependencies,
  type RecruitingOutboxEvent,
  type RecruitingTransactionContext,
  type RecruitParty,
  type ScrimRecruit,
} from "../src/modules/recruiting";

const now = new Date("2026-09-07T00:00:00.000Z");
const bodyDigestHex = "ab".repeat(32);

const scopes: Record<RecruitingCommand["type"], string> = {
  CREATE_PARTY: "bot:recruiting:party:create",
  SYNC_PARTY: "bot:recruiting:party:sync",
  GET_PARTY_STATUS: "bot:recruiting:party:status",
  FINISH_PARTY: "bot:recruiting:party:finish",
  CANCEL_PARTY: "bot:recruiting:party:cancel",
  RESET_PARTY: "admin:recruiting:party:reset",
  CREATE_SCRIM: "bot:recruiting:scrim:create",
  JOIN_SCRIM: "bot:recruiting:scrim:join",
  REOPEN_SCRIM: "bot:recruiting:scrim:reopen",
  CONFIRM_SCRIM: "bot:recruiting:scrim:confirm",
  COMPLETE_SCRIM: "bot:recruiting:scrim:complete",
  CANCEL_SCRIM: "bot:recruiting:scrim:cancel",
};

const botActor = {
  kind: "BOT" as const,
  principalId: "bot:kakao",
  authorizationIntent: {
    kind: "KAKAO_HMAC" as const,
    keyId: "current",
    timestampSeconds: Math.floor(now.getTime() / 1_000),
    nonce: "nonce_1234567890abcdef",
    roomId: "room-1",
    senderId: "operator-1",
    bodyDigestHex,
    requireNonceClaim: true as const,
    transactionRecheck: true as const,
  },
};

function seal<T extends RecruitingCommand>(command: T): T {
  const requestFingerprint = recruitingCommandRequestFingerprint(command);
  return { ...command, metadata: { ...command.metadata, idempotency: { ...command.metadata.idempotency, requestFingerprint } } };
}

let commandSequence = 0;

function command<Type extends RecruitingCommand["type"]>(
  type: Type,
  aggregateId: string,
  expectedRevision: number,
  payload: Extract<RecruitingCommand, { type: Type }>["payload"],
  actor?: RecruitingCommand["metadata"]["actor"],
): Extract<RecruitingCommand, { type: Type }> {
  commandSequence += 1;
  const requestSuffix = `${type.toLowerCase()}-${commandSequence}`;
  const selectedActor = actor ?? {
    ...botActor,
    authorizationIntent: { ...botActor.authorizationIntent, nonce: `nonce_${requestSuffix}_12345678` },
  };
  return seal({
    type,
    aggregateId,
    metadata: {
      actor: selectedActor,
      requestId: `request-${requestSuffix}`,
      expectedRevision,
      issuedAt: now.toISOString(),
      idempotency: {
        scope: scopes[type],
        keyHash: hashRecruitingRequestKey(`key-${requestSuffix}-12345678`),
        requestFingerprint: new Uint8Array(32),
        bodyDigestHex,
      },
    },
    payload,
  } as Extract<RecruitingCommand, { type: Type }>);
}

type Snapshot = {
  parties: Map<string, RecruitParty>;
  scrims: Map<string, ScrimRecruit>;
  receipts: Map<string, RecruitCommandReceipt>;
  audits: RecruitingAuditEvent[];
  outbox: RecruitingOutboxEvent[];
  nonceBindings: Map<string, string>;
};

function cloneSnapshot(snapshot: Snapshot): Snapshot {
  return structuredClone(snapshot);
}

class Harness {
  snapshot: Snapshot = { parties: new Map(), scrims: new Map(), receipts: new Map(), audits: [], outbox: [], nonceBindings: new Map() };
  operations: string[] = [];
  failOutbox = false;
  transaction = {} as RecruitingTransactionContext;

  dependencies(): RecruitingCommandHandlerDependencies {
    return {
      unitOfWork: {
        transaction: async <T>(operation: (transaction: RecruitingTransactionContext) => Promise<T>) => {
          const before = cloneSnapshot(this.snapshot);
          try {
            return await operation(this.transaction);
          } catch (error) {
            this.snapshot = before;
            throw error;
          }
        },
      },
      authorization: {
        recheck: async (_transaction, input) => {
          this.operations.push("authorization");
          if (input.actor.kind === "BOT") {
            if (input.actor.authorizationIntent.nonce === "blocked_nonce_123456") throw new Error("NONCE_REPLAYED");
            const identity = `${input.idempotency.scope}:${Buffer.from(input.idempotency.keyHash).toString("hex")}:${Buffer.from(input.idempotency.requestFingerprint).toString("hex")}`;
            const existing = this.snapshot.nonceBindings.get(input.actor.authorizationIntent.nonce);
            if (existing && existing !== identity) throw new Error("NONCE_REPLAYED");
            this.snapshot.nonceBindings.set(input.actor.authorizationIntent.nonce, identity);
          }
        },
      },
      receipts: {
        claim: async (_transaction, input) => {
          this.operations.push("claim");
          const key = Buffer.from(input.metadata.idempotency.keyHash).toString("hex");
          const receipt = this.snapshot.receipts.get(key);
          if (!receipt) return { kind: "CLAIMED" };
          return Buffer.from(receipt.requestHash).equals(input.metadata.idempotency.requestFingerprint)
            ? { kind: "REPLAY", receipt }
            : { kind: "MISMATCH" };
        },
        complete: async (_transaction, receipt) => {
          this.operations.push("receipt");
          this.snapshot.receipts.set(Buffer.from(receipt.keyHash).toString("hex"), receipt);
        },
      },
      repository: {
        loadPartyForUpdate: async (_transaction, id) => {
          this.operations.push("load");
          return this.snapshot.parties.get(id) ?? null;
        },
        loadScrimForUpdate: async (_transaction, id) => {
          this.operations.push("load");
          return this.snapshot.scrims.get(id) ?? null;
        },
        saveParty: async (_transaction, input) => {
          this.operations.push("save");
          this.snapshot.parties.set(input.party.id, input.party);
        },
        saveScrim: async (_transaction, input) => {
          this.operations.push("save");
          this.snapshot.scrims.set(input.scrim.id, input.scrim);
        },
      },
      audit: {
        append: async (_transaction, event) => {
          this.operations.push("audit");
          this.snapshot.audits.push(event);
        },
      },
      outbox: {
        append: async (_transaction, event) => {
          this.operations.push("outbox");
          if (this.failOutbox) throw new Error("OUTBOX_UNAVAILABLE");
          this.snapshot.outbox.push(event);
        },
      },
      clock: {
        now: () => new Date(now),
        receiptExpiresAt: (createdAt) => new Date(createdAt.getTime() + 24 * 60 * 60 * 1_000),
      },
    };
  }
}

function createParty(partyId = "party-1") {
  return command("CREATE_PARTY", partyId, 0, {
    recruitDate: "2026-09-07",
    resetSequence: 0,
    recruitNumber: 1,
    partyType: "FLEX_RANK",
    title: "저녁 내전 모집",
    maximumMembers: 5,
    members: [{ name: "Alpha", position: "TOP", slotNo: 1, substitute: false }],
    scheduledStartAt: "2026-09-07T10:00:00.000Z",
    protectedUntil: null,
  });
}

function createScrim(scrimId = "scrim-1") {
  return command("CREATE_SCRIM", scrimId, 0, {
    recruitDate: "2026-09-07",
    scrimNumber: 1,
    tournamentId: "destruction-1",
    requesterTeamId: "team-a",
    scheduledAt: "2026-09-07T11:00:00.000Z",
    bestOf: 3,
  });
}

test("party create, sync, status and finish use the domain while mutations commit in atomic order", async () => {
  const harness = new Harness();
  const handler = new RecruitingCommandHandler(harness.dependencies());
  const created = await handler.handle(createParty());
  assert.equal(created.revision, 0);
  assert.deepEqual(harness.operations, ["authorization", "claim", "load", "save", "audit", "outbox", "receipt"]);

  harness.operations = [];
  const synced = await handler.handle(command("SYNC_PARTY", "party-1", 0, {
    members: [
      { name: "Alpha", position: "TOP", slotNo: 1, substitute: false },
      { name: "Bravo", position: "JGL", slotNo: 2, substitute: false },
    ],
  }));
  assert.equal(synced.revision, 1);
  assert.equal(synced.body.data.memberCount, 2);

  harness.operations = [];
  const status = await handler.handle(command("GET_PARTY_STATUS", "party-1", 1, {}));
  assert.equal(status.body.status, "IN_PROGRESS");
  assert.deepEqual(harness.operations, ["authorization", "claim", "load", "receipt"]);

  const finished = await handler.handle(command("FINISH_PARTY", "party-1", 1, {}));
  assert.equal(finished.body.status, "FINISHED");
  assert.equal(finished.revision, 2);
});

test("party cancel and SUPER-only reset are distinct terminal commands", async () => {
  const cancelHarness = new Harness();
  const cancelHandler = new RecruitingCommandHandler(cancelHarness.dependencies());
  await cancelHandler.handle(createParty("party-cancel"));
  assert.equal((await cancelHandler.handle(command("CANCEL_PARTY", "party-cancel", 0, {}))).body.status, "CANCELED");

  const regularAdmin = {
    kind: "ADMIN" as const,
    principalId: "admin-1",
    sessionId: "session-1",
    authorizationIntent: { kind: "ADMIN_TOTP" as const, minimumRole: "ADMIN" as const, requireTotp: true as const, transactionRecheck: true as const },
  };
  const superAdmin = { ...regularAdmin, authorizationIntent: { ...regularAdmin.authorizationIntent, minimumRole: "SUPER_ADMIN" as const } };
  const resetHarness = new Harness();
  const resetHandler = new RecruitingCommandHandler(resetHarness.dependencies());
  await resetHandler.handle(createParty("party-reset"));
  const invalidReset = command("RESET_PARTY", "party-reset", 0, {}, regularAdmin);
  assert.throws(() => resetHandler.handle(invalidReset), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "INVALID_AUTHORIZATION_INTENT");
  assert.equal((await resetHandler.handle(command("RESET_PARTY", "party-reset", 0, {}, superAdmin))).body.status, "RESET");
});

test("scrim create, join, reopen, confirm, complete and cancel enforce the state machine", async () => {
  const harness = new Harness();
  const handler = new RecruitingCommandHandler(harness.dependencies());
  await handler.handle(createScrim());
  assert.equal((await handler.handle(command("JOIN_SCRIM", "scrim-1", 0, { opponentTeamId: "team-b" }))).body.status, "MATCHED");
  assert.equal((await handler.handle(command("REOPEN_SCRIM", "scrim-1", 1, {}))).body.status, "RECRUITING");
  assert.equal((await handler.handle(command("JOIN_SCRIM", "scrim-1", 2, { opponentTeamId: "team-c" }))).body.status, "MATCHED");
  assert.equal((await handler.handle(command("CONFIRM_SCRIM", "scrim-1", 3, {}))).body.status, "CONFIRMED");
  assert.equal((await handler.handle(command("COMPLETE_SCRIM", "scrim-1", 4, {}))).body.status, "COMPLETED");

  const cancelledHarness = new Harness();
  const cancelledHandler = new RecruitingCommandHandler(cancelledHarness.dependencies());
  await cancelledHandler.handle(createScrim("scrim-cancel"));
  assert.equal((await cancelledHandler.handle(command("CANCEL_SCRIM", "scrim-cancel", 0, {}))).body.status, "CANCELED");
});

test("durable receipt replay returns before load and same request key with another body conflicts", async () => {
  const harness = new Harness();
  const handler = new RecruitingCommandHandler(harness.dependencies());
  const original = createParty();
  const first = await handler.handle(original);
  harness.operations = [];
  const replay = await handler.handle(original);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.body, first.body);
  assert.deepEqual(harness.operations, ["authorization", "claim"]);

  const changed = seal({
    ...original,
    metadata: {
      ...original.metadata,
      actor: { ...botActor, authorizationIntent: { ...botActor.authorizationIntent, nonce: "nonce_changed_body_123456" } },
    },
    payload: { ...original.payload, title: "변경된 본문" },
  });
  await assert.rejects(() => handler.handle(changed), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "IDEMPOTENCY_MISMATCH");
  assert.equal(harness.snapshot.parties.get("party-1")?.title, "저녁 내전 모집");
});

test("a malformed replay receipt is rejected even when its request hash matches", async () => {
  const harness = new Harness();
  const handler = new RecruitingCommandHandler(harness.dependencies());
  const original = createParty("party-malformed-receipt");
  await handler.handle(original);
  const receiptKey = Buffer.from(original.metadata.idempotency.keyHash).toString("hex");
  const receipt = harness.snapshot.receipts.get(receiptKey)!;
  harness.snapshot.receipts.set(receiptKey, { ...receipt, body: { ...receipt.body, revision: 999 } });
  await assert.rejects(() => handler.handle(original), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "IDEMPOTENCY_MISMATCH");
});

test("outbox failure rolls repository, audit, outbox, and receipt back together", async () => {
  const harness = new Harness();
  harness.failOutbox = true;
  const handler = new RecruitingCommandHandler(harness.dependencies());
  await assert.rejects(() => handler.handle(createParty()), /OUTBOX_UNAVAILABLE/);
  assert.equal(harness.snapshot.parties.size, 0);
  assert.equal(harness.snapshot.audits.length, 0);
  assert.equal(harness.snapshot.outbox.length, 0);
  assert.equal(harness.snapshot.receipts.size, 0);
  assert.equal(harness.snapshot.nonceBindings.size, 0);
  assert.deepEqual(harness.operations, ["authorization", "claim", "load", "save", "audit", "outbox"]);
});

test("BOT body binding, JOB restriction, stale revision, and authorization failures happen before mutation", async () => {
  const harness = new Harness();
  const handler = new RecruitingCommandHandler(harness.dependencies());
  const forged = createParty();
  const badBodyActor = { ...botActor, authorizationIntent: { ...botActor.authorizationIntent, bodyDigestHex: "cd".repeat(32) } };
  assert.throws(() => handler.handle({ ...forged, metadata: { ...forged.metadata, actor: badBodyActor } }), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "INVALID_AUTHORIZATION_INTENT");

  const jobActor = {
    kind: "JOB" as const,
    principalId: "job:recruit-auto-finish",
    authorizationIntent: { kind: "SIGNED_JOB" as const, jobName: "recruit-auto-finish", timestampSeconds: Math.floor(now.getTime() / 1_000), nonce: "job_nonce_123456789", bodyDigestHex, transactionRecheck: true as const },
  };
  const invalidJobCommand = command("CREATE_SCRIM", "scrim-job", 0, createScrim().payload, jobActor);
  assert.throws(() => handler.handle(invalidJobCommand), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "INVALID_AUTHORIZATION_INTENT");

  await handler.handle(createParty("party-stale"));
  await assert.rejects(() => handler.handle(command("SYNC_PARTY", "party-stale", 9, { members: [] })), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "REVISION_CONFLICT");

  const jobHarness = new Harness();
  const jobHandler = new RecruitingCommandHandler(jobHarness.dependencies());
  await jobHandler.handle(createParty("party-job"));
  assert.equal((await jobHandler.handle(command("FINISH_PARTY", "party-job", 0, {}, jobActor))).body.status, "FINISHED");

  const nonceHarness = new Harness();
  const nonceHandler = new RecruitingCommandHandler(nonceHarness.dependencies());
  const blockedActor = { ...botActor, authorizationIntent: { ...botActor.authorizationIntent, nonce: "blocked_nonce_123456" } };
  const blocked = command("CREATE_PARTY", "party-blocked", 0, createParty("unused-party").payload, blockedActor);
  await assert.rejects(() => nonceHandler.handle(blocked), /NONCE_REPLAYED/);
  assert.equal(nonceHarness.snapshot.parties.size, 0);
  assert.deepEqual(nonceHarness.operations, ["authorization"]);
});

test("public party and scrim DTOs expose only reviewed fields", () => {
  const party: RecruitParty = {
    id: "party-1", revision: 4, recruitDate: "2026-09-07", resetSequence: 2, recruitNumber: 3,
    type: "ARAM", status: "IN_PROGRESS", title: "칼바람", maximumMembers: 5,
    members: [{ name: "private-name", position: null, slotNo: 1, substitute: false }],
    scheduledStartAt: null, protectedUntil: new Date(now), lastActivityAt: new Date(now),
  };
  assert.deepEqual(Object.keys(toPublicPartyDto(party)).sort(), ["id", "maximumMembers", "memberCount", "recruitNumber", "scheduledStartAt", "status", "title", "type"]);
  assert.equal("members" in toPublicPartyDto(party), false);
  const scrim: ScrimRecruit = { id: "scrim-1", revision: 2, recruitDate: "2026-09-07", scrimNumber: 1, tournamentId: "destruction-1", requesterTeamId: "team-a", opponentTeamId: "team-b", status: "MATCHED", scheduledAt: null, bestOf: 3 };
  assert.deepEqual(Object.keys(toPublicScrimDto(scrim)).sort(), ["bestOf", "id", "opponentTeamId", "recruitDate", "requesterTeamId", "scheduledAt", "scrimNumber", "status", "tournamentId"]);
  assert.equal("revision" in toPublicScrimDto(scrim), false);
});
