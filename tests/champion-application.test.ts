import assert from "node:assert/strict";
import test from "node:test";

import {
  ChampionApplicationError,
  ChampionCommandHandler,
  canonicalChampionKey,
  championCommandRequestHash,
  hashChampionRequestKey,
  normalizeChampionImageUrl,
  toPublicChampionDto,
  type Champion,
  type ChampionCommand,
  type ChampionCommandHandlerDependencies,
  type ChampionReceipt,
  type ChampionTransaction,
} from "../src/modules/champions";

const now = new Date("2026-09-07T09:00:00.000Z");
const bodyDigestHex = "ab".repeat(32);

function seal<T extends ChampionCommand>(command: T): T {
  return {
    ...command,
    metadata: {
      ...command.metadata,
      idempotency: { ...command.metadata.idempotency, requestHash: championCommandRequestHash(command) },
    },
  };
}

function command<Type extends ChampionCommand["type"]>(
  type: Type,
  expectedRevision: number,
  payload: Extract<ChampionCommand, { type: Type }>["payload"],
): Extract<ChampionCommand, { type: Type }> {
  const scope = {
    CREATE_CHAMPION: "admin:champions:create",
    UPDATE_CHAMPION: "admin:champions:update",
    DEACTIVATE_CHAMPION: "admin:champions:deactivate",
  }[type];
  return seal({
    type,
    championKey: "Ahri",
    metadata: {
      actorSession: { userAccountId: "admin-1", sessionId: "admin-session-1", role: "ADMIN", authVersion: 1 },
      requestId: `request-${type.toLowerCase()}`,
      expectedRevision,
      issuedAt: now.toISOString(),
      authorizationIntent: { kind: "ADMIN_TOTP", sessionId: "admin-session-1", minimumRole: "ADMIN", requireTotp: true, transactionRecheck: true },
      idempotency: {
        scope,
        keyHash: hashChampionRequestKey(`key-${type.toLowerCase()}-12345678`),
        requestHash: new Uint8Array(32),
        bodyDigestHex,
      },
    },
    payload,
  } as Extract<ChampionCommand, { type: Type }>);
}

type State = { champion: Champion | null; receipt: ChampionReceipt | null; audits: unknown[]; outbox: unknown[] };

class Harness {
  state: State = { champion: null, receipt: null, audits: [], outbox: [] };
  transaction = {} as ChampionTransaction;
  operations: string[] = [];
  authorized = true;
  failOutbox = false;

  dependencies(): ChampionCommandHandlerDependencies {
    return {
      unitOfWork: {
        transaction: async <T>(operation: (transaction: ChampionTransaction) => Promise<T>) => {
          const before = structuredClone(this.state);
          try { return await operation(this.transaction); }
          catch (error) { this.state = before; throw error; }
        },
      },
      authorization: {
        recheck: async (_transaction, input) => {
          this.operations.push("authorization");
          return this.authorized
            ? { principalId: input.metadata.actorSession.sessionId, userAccountId: "admin-1", role: "ADMIN" }
            : null;
        },
      },
      receipts: {
        claim: async () => {
          this.operations.push("receipt:claim");
          return this.state.receipt ? { kind: "REPLAY", receipt: this.state.receipt } : { kind: "CLAIMED" };
        },
        complete: async (_transaction, receipt) => {
          this.operations.push("receipt:complete");
          this.state.receipt = receipt;
        },
      },
      repository: {
        loadForUpdate: async () => { this.operations.push("champion:lock"); return this.state.champion; },
        insert: async (_transaction, champion) => { this.operations.push("champion:insert"); this.state.champion = champion; },
        save: async (_transaction, champion) => { this.operations.push("champion:save"); this.state.champion = champion; },
      },
      audit: { append: async (_transaction, event) => { this.operations.push("audit"); this.state.audits.push(event); } },
      outbox: {
        append: async (_transaction, event) => {
          this.operations.push("outbox");
          if (this.failOutbox) throw new Error("OUTBOX_FAILED");
          this.state.outbox.push(event);
        },
      },
      clock: { now: () => now, receiptExpiresAt: (value) => new Date(value.getTime() + 86_400_000) },
    };
  }
}

test("champion identity and public DTO are canonical and allowlisted", () => {
  assert.equal(canonicalChampionKey(" Ahri "), "ahri");
  assert.throws(() => canonicalChampionKey("아리#KR"), /INVALID_CHAMPION_KEY/);
  const imageUrl = "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Ahri.png";
  const champion: Champion = { key: "ahri", displayName: "아리", imageUrl, status: "ACTIVE", revision: 0, createdAt: now, updatedAt: now };
  assert.deepEqual(toPublicChampionDto(champion), { key: "ahri", displayName: "아리", imageUrl });
  assert.equal(normalizeChampionImageUrl(imageUrl), imageUrl);
  assert.equal(normalizeChampionImageUrl("https://ddragon.leagueoflegends.com.evil.invalid/cdn/16.17.1/img/champion/Ahri.png"), null);
  assert.equal(normalizeChampionImageUrl("https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Ahri.png?token=secret"), null);
  assert.throws(() => toPublicChampionDto({ ...champion, status: "INACTIVE" }), /CHAMPION_NOT_FOUND/);
});

test("ADMIN TOTP create, update and deactivate preserve history", async () => {
  const harness = new Harness();
  const handler = new ChampionCommandHandler(harness.dependencies());
  const created = await handler.handle(command("CREATE_CHAMPION", 0, { displayName: "아리" }));
  assert.deepEqual(created.body, { key: "ahri", displayName: "아리", status: "ACTIVE", revision: 0 });
  harness.state.receipt = null;
  const updated = await handler.handle(command("UPDATE_CHAMPION", 0, { displayName: "구미호 아리" }));
  assert.equal(updated.revision, 1);
  harness.state.receipt = null;
  const inactive = await handler.handle(command("DEACTIVATE_CHAMPION", 1, {}));
  assert.equal(inactive.body.status, "INACTIVE");
  assert.equal(harness.state.champion?.key, "ahri");
  assert.equal(harness.state.champion?.revision, 2);
  assert.equal(harness.state.audits.length, 3);
  assert.equal(harness.state.outbox.length, 3);
});

test("exact receipt replay returns before aggregate lock", async () => {
  const harness = new Harness();
  const handler = new ChampionCommandHandler(harness.dependencies());
  const input = command("CREATE_CHAMPION", 0, { displayName: "아리" });
  const first = await handler.handle(input);
  harness.operations = [];
  const replay = await handler.handle(input);
  assert.deepEqual(replay, { ...first, replayed: true });
  assert.deepEqual(harness.operations, ["authorization", "receipt:claim"]);
});

test("authorization and immutable body tampering fail closed", async () => {
  const denied = new Harness();
  denied.authorized = false;
  await assert.rejects(
    () => new ChampionCommandHandler(denied.dependencies()).handle(command("CREATE_CHAMPION", 0, { displayName: "아리" })),
    (error: unknown) => error instanceof ChampionApplicationError && error.code === "FORBIDDEN",
  );
  assert.deepEqual(denied.operations, ["authorization"]);

  const input = command("CREATE_CHAMPION", 0, { displayName: "아리" });
  const tampered = { ...input, payload: { displayName: "럭스" } };
  assert.throws(
    () => new ChampionCommandHandler(new Harness().dependencies()).handle(tampered),
    (error: unknown) => error instanceof ChampionApplicationError && error.code === "IDEMPOTENCY_MISMATCH",
  );
});

test("outbox failure rolls aggregate, audit and receipt back together", async () => {
  const harness = new Harness();
  harness.failOutbox = true;
  await assert.rejects(
    () => new ChampionCommandHandler(harness.dependencies()).handle(command("CREATE_CHAMPION", 0, { displayName: "아리" })),
    /OUTBOX_FAILED/,
  );
  assert.equal(harness.state.champion, null);
  assert.equal(harness.state.receipt, null);
  assert.equal(harness.state.audits.length, 0);
  assert.equal(harness.state.outbox.length, 0);
});
