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
  SYNC_SCRIM: "bot:recruiting:scrim:sync",
  JOIN_SCRIM: "bot:recruiting:scrim:join",
  REOPEN_SCRIM: "bot:recruiting:scrim:reopen",
  CONFIRM_SCRIM: "bot:recruiting:scrim:confirm",
  COMPLETE_SCRIM: "bot:recruiting:scrim:complete",
  CANCEL_SCRIM: "bot:recruiting:scrim:cancel",
};

const botActor = {
  kind: "BOT" as const,
  principalId: "bot:kakao",
  commandSource: "COMPAT_V1" as const,
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
  activeDestructionTournamentIds: string[] = ["destruction-active-1"];
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
        allocateNextPartyIdentityForUpdate: async (_transaction, input) => {
          this.operations.push("allocate-party-number");
          const parties = [...this.snapshot.parties.values()].filter((party) => party.recruitDate === "2026-09-07");
          const latest = parties.sort((left, right) => right.resetSequence - left.resetSequence || right.recruitNumber - left.recruitNumber)[0];
          if (!latest) return { resetSequence: 0, recruitNumber: input.preferredRecruitNumber ?? 1 };
          if (input.preferredRecruitNumber !== null) {
            return parties.some((party) => party.resetSequence === latest.resetSequence && party.recruitNumber === input.preferredRecruitNumber)
              ? null
              : { resetSequence: latest.resetSequence, recruitNumber: input.preferredRecruitNumber };
          }
          return latest.recruitNumber < 99 ? { resetSequence: latest.resetSequence, recruitNumber: latest.recruitNumber + 1 } : null;
        },
        loadPartyForUpdate: async (_transaction, id) => {
          this.operations.push("load");
          return this.snapshot.parties.get(id) ?? null;
        },
        loadScrimForUpdate: async (_transaction, id) => {
          this.operations.push("load");
          return this.snapshot.scrims.get(id) ?? null;
        },
        listActiveDestructionTournamentIdsForUpdate: async () => {
          this.operations.push("resolve-tournament");
          return [...this.activeDestructionTournamentIds];
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

test("BOT idempotency fingerprints bind the signed room, sender, and command source", () => {
  const original = createParty("party-room-bound");
  const otherRoom = {
    ...original,
    metadata: {
      ...original.metadata,
      actor: {
        ...botActor,
        authorizationIntent: { ...botActor.authorizationIntent, roomId: "room-2" },
      },
    },
  } satisfies Extract<RecruitingCommand, { type: "CREATE_PARTY" }>;
  assert.notDeepEqual(
    Buffer.from(recruitingCommandRequestFingerprint(original)),
    Buffer.from(recruitingCommandRequestFingerprint(otherRoom)),
  );
  const otherSender = {
    ...original,
    metadata: {
      ...original.metadata,
      actor: {
        ...botActor,
        authorizationIntent: { ...botActor.authorizationIntent, senderId: "operator-2" },
      },
    },
  } satisfies Extract<RecruitingCommand, { type: "CREATE_PARTY" }>;
  assert.notDeepEqual(
    Buffer.from(recruitingCommandRequestFingerprint(original)),
    Buffer.from(recruitingCommandRequestFingerprint(otherSender)),
  );
  const rawV2 = {
    ...original,
    metadata: {
      ...original.metadata,
      actor: { ...botActor, commandSource: "RAW_V2" as const },
    },
  } satisfies Extract<RecruitingCommand, { type: "CREATE_PARTY" }>;
  assert.notDeepEqual(
    Buffer.from(recruitingCommandRequestFingerprint(original)),
    Buffer.from(recruitingCommandRequestFingerprint(rawV2)),
  );
});

test("party create, sync, status and finish use the domain while mutations commit in atomic order", async () => {
  const harness = new Harness();
  const handler = new RecruitingCommandHandler(harness.dependencies());
  const created = await handler.handle(createParty());
  assert.equal(created.revision, 0);
  assert.equal(harness.snapshot.parties.get("party-1")?.sourceRoomId, "room-1");
  assert.equal(harness.snapshot.parties.get("party-1")?.sourceSenderId, "operator-1");
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
    sessionActor: { userAccountId: "admin-1", sessionId: "session-1", role: "ADMIN" as const, authVersion: 0 },
    authorizationIntent: { kind: "ADMIN_TOTP" as const, minimumRole: "ADMIN" as const, requireTotp: true as const, transactionRecheck: true as const },
  };
  const superAdmin = { ...regularAdmin, sessionActor: { ...regularAdmin.sessionActor, role: "SUPER_ADMIN" as const }, authorizationIntent: { ...regularAdmin.authorizationIntent, minimumRole: "SUPER_ADMIN" as const } };
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
  assert.equal(harness.snapshot.scrims.get("scrim-1")?.sourceRoomId, "room-1");
  assert.equal(harness.snapshot.scrims.get("scrim-1")?.sourceSenderId, "operator-1");
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

test("legacy scrim form fields remain durable in the typed aggregate", async () => {
  const harness = new Harness();
  const handler = new RecruitingCommandHandler(harness.dependencies());
  await handler.handle(command("CREATE_SCRIM", "scrim-legacy", 0, {
    recruitDate: "2026-09-07", scrimNumber: 2, tournamentId: null, legacyTournamentNumber: 14,
    requesterTeamId: null, title: "별빛단 스크림", requesterTeamName: "별빛단", opponentTeamName: "달빛단",
    requesterLineup: { top: "가", jungle: "나", mid: "다", adc: "라", support: "마" },
    opponentLineup: { top: "바", jungle: "사", mid: "아", adc: "자", support: "차" },
    memo: "즐겁게", seriesRuleText: "3판2선", scheduledAt: "2026-09-07T12:30:00.000Z", bestOf: 3,
  }));
  const stored = harness.snapshot.scrims.get("scrim-legacy");
  assert.equal(stored?.legacyTournamentNumber, 14);
  assert.equal(stored?.requesterTeamName, "별빛단");
  assert.equal(stored?.requesterLineup?.jungle, "나");
  assert.equal(stored?.legacyMemo, "즐겁게");
});

test("signed V1 scrim forms infer exactly one active destruction tournament inside the transaction", async () => {
  const harness = new Harness();
  harness.activeDestructionTournamentIds = ["destruction-active-only"];
  const handler = new RecruitingCommandHandler(harness.dependencies());
  const v1Command = command("CREATE_SCRIM", "scrim-v1-inferred", 0, {
    recruitDate: "2026-09-07", scrimNumber: 4, tournamentId: null, legacyTournamentNumber: null,
    requesterTeamId: null, requesterTeamName: "별빛단", scheduledAt: null, bestOf: 3,
  });

  const created = await handler.handle(v1Command);
  assert.equal(created.body.data.tournamentId, "destruction-active-only");
  assert.equal(created.body.data.legacyTournamentNumber, null);
  assert.equal(harness.snapshot.scrims.get("scrim-v1-inferred")?.tournamentId, "destruction-active-only");
  assert.equal(harness.snapshot.audits[0]?.after.tournamentId, "destruction-active-only");
  assert.deepEqual(harness.operations, ["authorization", "claim", "load", "resolve-tournament", "save", "audit", "outbox", "receipt"]);

  harness.operations = [];
  harness.activeDestructionTournamentIds = ["changed-one", "changed-two"];
  const replay = await handler.handle(v1Command);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.body, created.body);
  assert.deepEqual(harness.operations, ["authorization", "claim"]);
});

test("signed V1 scrim inference rejects zero or multiple active destruction tournaments atomically", async () => {
  for (const [candidates, expectedCode] of [
    [[], "ACTIVE_DESTRUCTION_TOURNAMENT_NOT_FOUND"],
    [["destruction-active-a", "destruction-active-b"], "ACTIVE_DESTRUCTION_TOURNAMENT_AMBIGUOUS"],
  ] as const) {
    const harness = new Harness();
    harness.activeDestructionTournamentIds = [...candidates];
    const handler = new RecruitingCommandHandler(harness.dependencies());
    await assert.rejects(
      handler.handle(command("CREATE_SCRIM", `scrim-${expectedCode.toLowerCase()}`, 0, {
        recruitDate: "2026-09-07", scrimNumber: 5, tournamentId: null, legacyTournamentNumber: null,
        requesterTeamId: null, requesterTeamName: "별빛단", scheduledAt: null, bestOf: 3,
      })),
      (error: unknown) => error instanceof RecruitingApplicationError && error.code === expectedCode,
    );
    assert.equal(harness.snapshot.scrims.size, 0);
    assert.equal(harness.snapshot.receipts.size, 0);
    assert.equal(harness.snapshot.audits.length, 0);
    assert.equal(harness.snapshot.outbox.length, 0);
    assert.equal(harness.snapshot.nonceBindings.size, 0);
  }
});

test("full scrim sync is revision-bound, audited and idempotently replayed", async () => {
  const harness = new Harness();
  const handler = new RecruitingCommandHandler(harness.dependencies());
  await handler.handle(command("CREATE_SCRIM", "scrim-sync", 0, {
    recruitDate: "2026-09-07", scrimNumber: 3, tournamentId: null, legacyTournamentNumber: 14,
    requesterTeamId: null, title: "별빛단 스크림", requesterTeamName: "별빛단", opponentTeamName: null,
    requesterLineup: { top: "가", jungle: "나", mid: "다", adc: "라", support: "마" },
    opponentLineup: null, memo: null, seriesRuleText: "3판2선", scheduledAt: null, bestOf: 3,
  }));
  const syncCommand = command("SYNC_SCRIM", "scrim-sync", 0, {
    recruitDate: "2026-09-07", scrimNumber: 3, tournamentId: null, legacyTournamentNumber: 14,
    requesterTeamId: null, title: "별빛단 스크림 구인", requesterTeamName: "별빛단", opponentTeamName: "달빛단",
    requesterLineup: { top: "새가", jungle: "새나", mid: "새다", adc: "새라", support: "새마" },
    opponentLineup: { top: "바", jungle: "사", mid: "아", adc: "자", support: "차" },
    memo: "수정 메모", seriesRuleText: "5판3선", scheduledAt: "2026-09-07T13:00:00.000Z", bestOf: 5,
  });
  const synced = await handler.handle(syncCommand);
  assert.equal(synced.revision, 1);
  assert.equal(synced.body.status, "MATCHED");
  assert.equal(synced.body.data.opponentTeamName, "달빛단");
  assert.equal(synced.body.data.bestOf, 5);
  assert.equal((await handler.handle(syncCommand)).replayed, true);
  assert.equal(harness.snapshot.audits.filter((event) => event.action === "RECRUITING_SYNC_SCRIM").length, 1);
  assert.equal(harness.snapshot.outbox.filter((event) => event.eventType === "RECRUITING_SYNC_SCRIM").length, 1);
  const audit = harness.snapshot.audits.find((event) => event.action === "RECRUITING_SYNC_SCRIM");
  assert.equal(audit?.before?.bestOf, 3);
  assert.equal(audit?.after.bestOf, 5);
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

test("one signed Kakao delivery received by two installations mutates canonical room state once", async () => {
  const harness = new Harness();
  const handler = new RecruitingCommandHandler(harness.dependencies());
  const deliveryId = `delivery-${"7".repeat(32)}`;
  const firstActor = { ...botActor, authorizationIntent: { ...botActor.authorizationIntent, installationId: `install-${"1".repeat(32)}`, deliveryId, nonce: "nonce_installation_a_123456" } };
  const first = command("CREATE_PARTY", "party-two-installations", 0, {
    recruitDate: "2026-09-09", resetSequence: 0, recruitNumber: 17, partyType: "FLEX_RANK",
    title: "설치본 중복 방지", maximumMembers: 5, members: [], scheduledStartAt: null, protectedUntil: null,
  }, firstActor);
  const second = seal({
    ...first,
    metadata: {
      ...first.metadata,
      requestId: "request-installation-b",
      actor: { ...botActor, authorizationIntent: { ...botActor.authorizationIntent, installationId: `install-${"2".repeat(32)}`, senderId: "operator-from-second-installation", deliveryId, nonce: "nonce_installation_b_123456" } },
    },
  });
  const created = await handler.handle(first);
  const replay = await handler.handle(second);
  assert.equal(created.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(harness.snapshot.parties.size, 1);
  assert.equal(harness.snapshot.audits.filter((event) => event.action === "RECRUITING_CREATE_PARTY").length, 1);
  assert.equal(harness.snapshot.outbox.filter((event) => event.eventType === "RECRUITING_CREATE_PARTY").length, 1);
});

test("server-clock party metadata fallback is identical on durable replay", async () => {
  const harness = new Harness();
  const handler = new RecruitingCommandHandler(harness.dependencies());
  const original = command("CREATE_PARTY", "party-meta-replay", 0, {
    recruitDate: "2026-09-07", resetSequence: 0, recruitNumber: 8, partyType: "FLEX_RANK",
    title: "재생 시간 고정", maximumMembers: 5, members: [], startTimeText: null, gameInfo: null,
    scheduledStartAt: null, protectedUntil: null,
  });
  const first = await handler.handle(original);
  const replay = await handler.handle(original);
  assert.equal(first.body.data.startTimeText, "09:00");
  assert.equal(first.body.data.gameInfo, "미입력");
  assert.equal(replay.replayed, true);
  assert.equal(replay.body.data.startTimeText, "09:00");
  assert.deepEqual(replay.body, first.body);
  assert.equal(harness.snapshot.parties.get("party-meta-replay")?.startTimeText, "09:00");
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
    id: "party-1", revision: 4, sourceRoomId: null, sourceSenderId: null, recruitDate: "2026-09-07", resetSequence: 2, recruitNumber: 3,
    type: "ARAM", status: "IN_PROGRESS", title: "칼바람", maximumMembers: 5,
    members: [{ name: "private-name", position: null, slotNo: 1, substitute: false }],
    startTimeText: "21:00", gameInfo: "미입력",
    scheduledStartAt: null, protectedUntil: new Date(now), lastActivityAt: new Date(now),
  };
  assert.deepEqual(Object.keys(toPublicPartyDto(party)).sort(), ["gameInfo", "id", "maximumMembers", "memberCount", "recruitNumber", "scheduledStartAt", "startTimeText", "status", "title", "type"]);
  assert.equal("members" in toPublicPartyDto(party), false);
  const scrim: ScrimRecruit = { id: "scrim-1", revision: 2, sourceRoomId: null, sourceSenderId: null, opponentSenderId: null, recruitDate: "2026-09-07", scrimNumber: 1, tournamentId: "destruction-1", legacyTournamentNumber: null, requesterTeamId: "team-a", opponentTeamId: "team-b", requesterLineup: null, opponentLineup: null, legacyMemo: null, legacySeriesRuleText: null, status: "MATCHED", scheduledAt: null, bestOf: 3 };
  assert.deepEqual(Object.keys(toPublicScrimDto(scrim)).sort(), ["bestOf", "id", "legacyTournamentNumber", "memo", "opponentLineup", "opponentTeamId", "opponentTeamName", "recruitDate", "requesterLineup", "requesterTeamId", "requesterTeamName", "scheduledAt", "scrimNumber", "seriesRuleText", "status", "title", "tournamentId"]);
  assert.equal("revision" in toPublicScrimDto(scrim), false);
});
