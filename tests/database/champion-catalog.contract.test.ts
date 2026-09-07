import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { eq, sql } from "drizzle-orm";

import type { TransactionSessionActor } from "../../src/modules/auth/domain/transaction-session";
import {
  ChampionApplicationError,
  ChampionCommandHandler,
  ChampionQueryService,
  championCommandRequestHash,
  hashChampionRequestKey,
  type ChampionCommand,
} from "../../src/modules/champions";
import { PostgresChampionAdapter } from "../../src/modules/champions/infrastructure/postgres-champion-adapter";
import { PostgresChampionQueryRepository } from "../../src/modules/champions/infrastructure/postgres-champion-query-repository";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import {
  auditEvents,
  authSessions,
  championCatalog,
  championCommandReceipts,
  championOutbox,
  userAccounts,
} from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const commandScopes = {
  CREATE_CHAMPION: "admin:champions:create",
  UPDATE_CHAMPION: "admin:champions:update",
  DEACTIVATE_CHAMPION: "admin:champions:deactivate",
} as const;

function isChampionError(code: ChampionApplicationError["code"]) {
  return (error: unknown) => error instanceof ChampionApplicationError && error.code === code;
}

function command(input: Readonly<{
  type: ChampionCommand["type"];
  championKey: string;
  expectedRevision: number;
  payload: ChampionCommand["payload"];
  actor: TransactionSessionActor;
  label: string;
  keyHash?: Uint8Array;
}>): ChampionCommand {
  const bodyDigestHex = createHash("sha256")
    .update(JSON.stringify({
      championKey: input.championKey,
      expectedRevision: input.expectedRevision,
      payload: input.payload,
      type: input.type,
    }))
    .digest("hex");
  const draft = {
    type: input.type,
    championKey: input.championKey,
    metadata: {
      actorSession: input.actor,
      requestId: randomUUID(),
      expectedRevision: input.expectedRevision,
      issuedAt: new Date().toISOString(),
      authorizationIntent: {
        kind: "ADMIN_TOTP",
        sessionId: input.actor.sessionId,
        minimumRole: "ADMIN",
        requireTotp: true,
        transactionRecheck: true,
      },
      idempotency: {
        scope: commandScopes[input.type],
        keyHash: input.keyHash ?? hashChampionRequestKey(`s10-champion-${input.label}-0001`),
        requestHash: new Uint8Array(32),
        bodyDigestHex,
      },
    },
    payload: input.payload,
  } as ChampionCommand;
  return {
    ...draft,
    metadata: {
      ...draft.metadata,
      idempotency: {
        ...draft.metadata.idempotency,
        requestHash: championCommandRequestHash(draft),
      },
    },
  } as ChampionCommand;
}

test("S10 champion catalog keeps ADMIN TOTP mutations, replay and durable ledgers atomic", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.V2_DB_TEST_MODE,
  });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const adminId = randomUUID();
  const verifiedSessionId = randomUUID();
  const unverifiedSessionId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60_000);
  const actor = {
    userAccountId: adminId,
    sessionId: verifiedSessionId,
    role: "ADMIN",
    authVersion: 0,
  } as const;
  const unverifiedActor = { ...actor, sessionId: unverifiedSessionId };

  try {
    await applyMigrations(database);
    await applyMigrations(database);

    const tables = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'catalog' order by table_name",
    );
    assert.deepEqual(
      tables.rows.map((row) => row.table_name),
      ["champion_command_receipts", "champion_outbox", "champions"],
    );

    await database.insert(userAccounts).values({
      id: adminId,
      loginId: "s10-champion-admin",
      loginIdNormalized: "s10-champion-admin",
      role: "ADMIN",
      status: "APPROVED",
    });
    await database.insert(authSessions).values([
      {
        id: verifiedSessionId,
        tokenHash: randomBytes(32),
        userAccountId: adminId,
        authVersion: 0,
        role: "ADMIN",
        purpose: "ADMIN",
        totpVerifiedAt: now,
        issuedAt: now,
        expiresAt,
      },
      {
        id: unverifiedSessionId,
        tokenHash: randomBytes(32),
        userAccountId: adminId,
        authVersion: 0,
        role: "ADMIN",
        purpose: "ADMIN",
        issuedAt: now,
        expiresAt,
      },
    ]);

    const legacyCreatedAt = new Date("2026-01-01T00:00:00.000Z");
    await database.insert(championCatalog).values({
      key: "legacy-kept",
      displayName: "기존 챔피언",
      status: "ACTIVE",
      revision: 7,
      createdAt: legacyCreatedAt,
      updatedAt: legacyCreatedAt,
    });

    const adapter = new PostgresChampionAdapter(database);
    const handler = new ChampionCommandHandler(adapter.dependencies());
    const queries = new ChampionQueryService(new PostgresChampionQueryRepository(database));
    const create = command({
      type: "CREATE_CHAMPION",
      championKey: "contract-ahri",
      expectedRevision: 0,
      payload: { displayName: "계약 아리" },
      actor,
      label: "create",
    });
    const created = await handler.handle(create);
    assert.deepEqual(created, {
      body: { key: "contract-ahri", displayName: "계약 아리", status: "ACTIVE", revision: 0 },
      revision: 0,
      status: 201,
      replayed: false,
    });
    assert.deepEqual(await handler.handle(create), { ...created, replayed: true });

    const countsAfterCreate = {
      receipts: (await database.select().from(championCommandReceipts)).length,
      audits: (await database.select().from(auditEvents).where(eq(auditEvents.targetType, "CHAMPION"))).length,
      outbox: (await database.select().from(championOutbox)).length,
    };
    assert.deepEqual(countsAfterCreate, { receipts: 1, audits: 1, outbox: 1 });

    const mismatchedReplay = command({
      type: "CREATE_CHAMPION",
      championKey: "contract-ahri",
      expectedRevision: 0,
      payload: { displayName: "다른 이름" },
      actor,
      label: "mismatch",
      keyHash: create.metadata.idempotency.keyHash,
    });
    await assert.rejects(handler.handle(mismatchedReplay), isChampionError("IDEMPOTENCY_MISMATCH"));
    assert.deepEqual({
      receipts: (await database.select().from(championCommandReceipts)).length,
      audits: (await database.select().from(auditEvents).where(eq(auditEvents.targetType, "CHAMPION"))).length,
      outbox: (await database.select().from(championOutbox)).length,
    }, countsAfterCreate);

    const updated = await handler.handle(command({
      type: "UPDATE_CHAMPION",
      championKey: "contract-ahri",
      expectedRevision: 0,
      payload: { displayName: "구미호 아리" },
      actor,
      label: "update",
    }));
    assert.deepEqual(updated.body, {
      key: "contract-ahri",
      displayName: "구미호 아리",
      status: "ACTIVE",
      revision: 1,
    });

    await assert.rejects(handler.handle(command({
      type: "UPDATE_CHAMPION",
      championKey: "contract-ahri",
      expectedRevision: 0,
      payload: { displayName: "오래된 수정" },
      actor,
      label: "stale",
    })), isChampionError("PRECONDITION_FAILED"));

    const deactivated = await handler.handle(command({
      type: "DEACTIVATE_CHAMPION",
      championKey: "contract-ahri",
      expectedRevision: 1,
      payload: {},
      actor,
      label: "deactivate",
    }));
    assert.equal(deactivated.body.status, "INACTIVE");
    assert.equal(deactivated.revision, 2);

    assert.equal(await queries.getPublic("contract-ahri"), null);
    assert.deepEqual(await queries.getPublic("legacy-kept"), {
      key: "legacy-kept",
      displayName: "기존 챔피언",
    });
    const publicPage = await queries.listPublic({ query: null, status: null, page: 1, pageSize: 100 });
    assert.deepEqual(publicPage.items.map((champion) => champion.key), ["legacy-kept"]);
    const adminPage = await queries.listAdmin({ query: null, status: null, page: 1, pageSize: 100 });
    assert.deepEqual(adminPage.items.map((champion) => champion.key).sort(), ["contract-ahri", "legacy-kept"]);

    const retained = (await database.select().from(championCatalog).where(eq(championCatalog.key, "legacy-kept")))[0];
    assert.equal(retained?.revision, 7, "pre-existing catalog data must remain unchanged");
    assert.equal(retained?.createdAt.toISOString(), legacyCreatedAt.toISOString());

    await assert.rejects(handler.handle(command({
      type: "CREATE_CHAMPION",
      championKey: "totp-denied",
      expectedRevision: 0,
      payload: { displayName: "거부 대상" },
      actor: unverifiedActor,
      label: "totp-denied",
    })), isChampionError("FORBIDDEN"));
    assert.equal((await database.select().from(championCatalog).where(eq(championCatalog.key, "totp-denied"))).length, 0);

    assert.deepEqual({
      receipts: (await database.select().from(championCommandReceipts)).length,
      audits: (await database.select().from(auditEvents).where(eq(auditEvents.targetType, "CHAMPION"))).length,
      outbox: (await database.select().from(championOutbox)).length,
    }, { receipts: 3, audits: 3, outbox: 3 });

    await database.execute(sql`
      alter table catalog.champion_outbox
      add constraint champion_outbox_contract_forced_failure
      check (champion_key <> 'rollback-fox')
    `);
    try {
      await assert.rejects(handler.handle(command({
        type: "CREATE_CHAMPION",
        championKey: "rollback-fox",
        expectedRevision: 0,
        payload: { displayName: "롤백 여우" },
        actor,
        label: "rollback",
      })));
      assert.equal((await database.select().from(championCatalog).where(eq(championCatalog.key, "rollback-fox"))).length, 0);
      assert.equal((await database.select().from(auditEvents).where(eq(auditEvents.targetId, "rollback-fox"))).length, 0);
      assert.equal((await database.select().from(championOutbox).where(eq(championOutbox.championKey, "rollback-fox"))).length, 0);
    } finally {
      await database.execute(sql`
        alter table catalog.champion_outbox
        drop constraint champion_outbox_contract_forced_failure
      `);
    }

    await assert.rejects(database.delete(championCatalog).where(eq(championCatalog.key, "contract-ahri")));
    assert.equal((await database.select().from(championCatalog).where(eq(championCatalog.key, "contract-ahri")))[0]?.status, "INACTIVE");
  } finally {
    await pool.end();
  }
});
