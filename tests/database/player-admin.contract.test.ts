import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { count, eq, sql } from "drizzle-orm";

import {
  playerMutationFingerprint,
  playerMutationScope,
  type PlayerMutationCommand,
  type PlayerWriteInput,
} from "../../src/modules/players/domain/admin-player";
import { PostgresAdminPlayerRepository } from "../../src/modules/players/infrastructure/postgres-admin-player-repository";
import { PostgresPlayerRepository } from "../../src/modules/players/infrastructure/postgres-player-repository";
import { PostgresPublicPlayerLegacyMappingRepository } from "../../src/modules/players/infrastructure/postgres-public-player-legacy-mapping-repository";
import { idempotencyHashMaterial, readIdempotencyKey } from "../../src/platform/http/index";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import {
  auditEvents,
  authSessions,
  playerMutationReceipts,
  players,
  userAccounts,
} from "../../src/platform/db/schema/index";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

function account(loginId: string, role: "ADMIN" | "SUPER_ADMIN") {
  return {
    id: randomUUID(),
    sessionId: randomUUID(),
    authVersion: 0,
    loginId,
    loginIdNormalized: loginId.toLocaleLowerCase("ko-KR"),
    passwordHash: "$argon2id$v=19$synthetic-player-admin-contract",
    role,
    status: "APPROVED" as const,
  };
}

function accountRow(actor: ReturnType<typeof account>) {
  return {
    id: actor.id,
    authVersion: actor.authVersion,
    loginId: actor.loginId,
    loginIdNormalized: actor.loginIdNormalized,
    passwordHash: actor.passwordHash,
    role: actor.role,
    status: actor.status,
  };
}

function mutationCommand(
  actor: ReturnType<typeof account>,
  key: string,
  scope: string,
  requestFingerprint: string,
): PlayerMutationCommand {
  const parsed = readIdempotencyKey(new Headers({ "Idempotency-Key": key }));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("Synthetic idempotency key was rejected.");
  return {
    actorUserAccountId: actor.id,
    actorSession: {
      userAccountId: actor.id,
      sessionId: actor.sessionId,
      role: actor.role,
      authVersion: actor.authVersion,
    },
    requestId: randomUUID(),
    idempotencyKeyMaterial: idempotencyHashMaterial(parsed.key, scope),
    requestFingerprint,
    now: new Date(),
  };
}

function uniqueKey(label: string) {
  return `${label}-${randomBytes(18).toString("base64url")}`;
}

function playerInput(suffix: string, legacyId: number | null): PlayerWriteInput {
  return {
    legacyId,
    memberName: `비공개 합성 회원 ${suffix}`,
    nickname: `Contract${suffix}`,
    tagLine: "S02",
    peakTier: "DIAMOND II",
    currentTier: "PLATINUM IV",
  };
}

test("S02 player mutations, legacy mapping, privacy, replay, and rollback hold on PostgreSQL 18", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.V2_DB_TEST_MODE,
  });

  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  try {
    await applyMigrations(database);
    const suffix = randomBytes(5).toString("hex");
    const admin = account(`player_admin_${suffix}`, "ADMIN");
    const superAdmin = account(`player_super_${suffix}`, "SUPER_ADMIN");
    await database.insert(userAccounts).values([admin, superAdmin].map(accountRow));
    const sessionNow = new Date();
    await database.insert(authSessions).values(
      [admin, superAdmin].map((actor) => ({
        id: actor.sessionId,
        tokenHash: randomBytes(32),
        userAccountId: actor.id,
        authVersion: actor.authVersion,
        role: actor.role,
        purpose: "ADMIN" as const,
        totpVerifiedAt: sessionNow,
        issuedAt: sessionNow,
        expiresAt: new Date(sessionNow.getTime() + 30 * 60_000),
      })),
    );
    const repository = new PostgresAdminPlayerRepository(database);
    const publicRepository = new PostgresPlayerRepository(database);
    const mappingRepository = new PostgresPublicPlayerLegacyMappingRepository(database);
    const unrelatedExpiredPlayerReceiptKey = randomBytes(32);
    await database.insert(playerMutationReceipts).values({
      actorUserAccountId: superAdmin.id,
      scope: "players:unrelated-expired-retention",
      keyHash: unrelatedExpiredPlayerReceiptKey,
      requestHash: randomBytes(32),
      responseStatus: 200,
      responseJson: { message: "expired unrelated receipt" },
      responseEtag: '"0"',
      createdAt: new Date(Date.now() - 48 * 60 * 60_000),
      expiresAt: new Date(Date.now() - 24 * 60 * 60_000),
    });
    const input = playerInput(suffix, 1_500_000_000);
    const createScope = playerMutationScope("create");
    const createFingerprint = playerMutationFingerprint({ action: "create", player: input });
    const createKey = uniqueKey("player-create");
    const createCommand = mutationCommand(admin, createKey, createScope, createFingerprint);

    const created = await repository.create(input, createCommand);
    assert.equal(created.type, "success");
    assert.equal((await database.select({ value: count() }).from(playerMutationReceipts).where(
      eq(playerMutationReceipts.keyHash, unrelatedExpiredPlayerReceiptKey),
    ))[0]?.value, 1, "a player command must not globally delete unrelated expired receipts");
    if (created.type !== "success") throw new Error("Player creation did not succeed.");
    assert.equal(created.status, 201);
    assert.equal(created.replayed, false);
    assert.equal(created.revision, 0);
    assert.equal(created.response.player.memberName, input.memberName);
    assert.equal(created.response.player.legacyId, input.legacyId);

    const replayed = await repository.create(input, mutationCommand(admin, createKey, createScope, createFingerprint));
    assert.deepEqual(replayed, { ...created, replayed: true });

    const reusedForDifferentBody = await repository.create(
      { ...input, currentTier: "GOLD I" },
      mutationCommand(
        admin,
        createKey,
        createScope,
        playerMutationFingerprint({ action: "create", player: { ...input, currentTier: "GOLD I" } }),
      ),
    );
    assert.deepEqual(reusedForDifferentBody, { type: "conflict", reason: "IDEMPOTENCY_KEY_REUSED" });

    const playerId = created.response.player.id;
    assert.equal(await mappingRepository.findPublicUuidByLegacyId(input.legacyId!), playerId);
    const publicMemberNameMatch = await publicRepository.search(input.memberName);
    assert.equal(publicMemberNameMatch.length, 1);
    assert.equal(publicMemberNameMatch[0]?.id, playerId);
    assert.equal("memberName" in publicMemberNameMatch[0]!, false);
    assert.equal((await publicRepository.search("비공개 합성 회원")).length, 0);
    assert.equal((await repository.list({ query: input.memberName, status: "ALL", page: 1, pageSize: 20 })).items[0]?.id, playerId);

    const receiptRows = await pool.query<{ key_hex: string; response_text: string }>(
      `select encode(key_hash, 'hex') as key_hex, response_json::text as response_text
         from registry.player_mutation_receipts
        where actor_user_account_id = $1`,
      [admin.id],
    );
    assert.equal(receiptRows.rowCount, 1);
    assert.match(receiptRows.rows[0]?.key_hex ?? "", /^[0-9a-f]{64}$/);
    assert.equal(receiptRows.rows[0]?.response_text.includes(createKey), false);
    assert.notEqual(receiptRows.rows[0]?.key_hex, Buffer.from(createKey).toString("hex"));

    const duplicateRiot = await repository.create(
      { ...input, legacyId: null, memberName: "다른 회원" },
      mutationCommand(
        admin,
        uniqueKey("duplicate-riot"),
        createScope,
        playerMutationFingerprint({ action: "create", player: { ...input, legacyId: null, memberName: "다른 회원" } }),
      ),
    );
    assert.deepEqual(duplicateRiot, { type: "conflict", reason: "DUPLICATE_RIOT_ID" });

    const duplicateLegacyInput = playerInput(`${suffix}legacy`, input.legacyId);
    const duplicateLegacy = await repository.create(
      duplicateLegacyInput,
      mutationCommand(
        superAdmin,
        uniqueKey("duplicate-legacy"),
        createScope,
        playerMutationFingerprint({ action: "create", player: duplicateLegacyInput }),
      ),
    );
    assert.deepEqual(duplicateLegacy, { type: "conflict", reason: "DUPLICATE_LEGACY_ID" });

    const receiptClock = Date.now();
    const expiredReceiptHash = randomBytes(32);
    const retainedReceiptHash = randomBytes(32);
    await database.insert(playerMutationReceipts).values([
      {
        actorUserAccountId: admin.id,
        scope: "players:test-expired-other-key",
        keyHash: expiredReceiptHash,
        requestHash: randomBytes(32),
        responseStatus: 200,
        responseJson: { synthetic: "expired" },
        responseEtag: '"0"',
        createdAt: new Date(receiptClock - 48 * 60 * 60 * 1_000),
        expiresAt: new Date(receiptClock - 24 * 60 * 60 * 1_000),
      },
      {
        actorUserAccountId: admin.id,
        scope: "players:test-retained-other-key",
        keyHash: retainedReceiptHash,
        requestHash: randomBytes(32),
        responseStatus: 200,
        responseJson: { synthetic: "retained" },
        responseEtag: '"0"',
        createdAt: new Date(receiptClock),
        expiresAt: new Date(receiptClock + 24 * 60 * 60 * 1_000),
      },
    ]);

    const updatedInput = { ...input, nickname: `Updated${suffix}`, currentTier: "EMERALD III" };
    const updateScope = playerMutationScope("update", playerId);
    const updateFingerprint = playerMutationFingerprint({
      action: "update",
      playerId,
      expectedRevision: 0,
      player: updatedInput,
    });
    const updated = await repository.update(
      playerId,
      updatedInput,
      0,
      mutationCommand(admin, uniqueKey("player-update"), updateScope, updateFingerprint),
    );
    assert.equal(updated.type, "success");
    if (updated.type !== "success") throw new Error("Player update did not succeed.");
    assert.equal(updated.revision, 1);
    const expiredReceipt = await database
      .select({ value: count() })
      .from(playerMutationReceipts)
      .where(eq(playerMutationReceipts.keyHash, expiredReceiptHash));
    const retainedReceipt = await database
      .select({ value: count() })
      .from(playerMutationReceipts)
      .where(eq(playerMutationReceipts.keyHash, retainedReceiptHash));
    assert.equal(
      expiredReceipt[0]?.value,
      1,
      "a player update must leave an expired receipt with a different scope and key for bounded cleanup",
    );
    assert.equal(retainedReceipt[0]?.value, 1);

    const stale = await repository.update(
      playerId,
      updatedInput,
      0,
      mutationCommand(
        admin,
        uniqueKey("stale-update"),
        updateScope,
        playerMutationFingerprint({ action: "update", playerId, expectedRevision: 0, player: updatedInput }),
      ),
    );
    assert.deepEqual(stale, { type: "precondition-failed", currentRevision: 1 });
    const missingPlayerId = randomUUID();
    const missingFingerprint = playerMutationFingerprint({
      action: "update",
      playerId: missingPlayerId,
      expectedRevision: 0,
      player: updatedInput,
    });
    const missing = await repository.update(
      missingPlayerId,
      updatedInput,
      0,
      mutationCommand(
        admin,
        uniqueKey("missing-update"),
        playerMutationScope("update", missingPlayerId),
        missingFingerprint,
      ),
    );
    assert.deepEqual(missing, { type: "not-found" });

    const deactivateScope = playerMutationScope("deactivate", playerId);
    const deactivateFingerprint = playerMutationFingerprint({ action: "deactivate", playerId, expectedRevision: 1 });
    const deactivateKey = uniqueKey("player-deactivate");
    const deactivated = await repository.deactivate(
      playerId,
      1,
      mutationCommand(admin, deactivateKey, deactivateScope, deactivateFingerprint),
    );
    assert.equal(deactivated.type, "success");
    if (deactivated.type !== "success") throw new Error("Player deactivation did not succeed.");
    assert.equal(deactivated.revision, 2);
    assert.equal(deactivated.response.player.status, "INACTIVE");
    assert.equal(await mappingRepository.findPublicUuidByLegacyId(input.legacyId!), null);
    assert.equal((await publicRepository.search(updatedInput.nickname)).length, 0);
    assert.deepEqual(
      await repository.deactivate(
        playerId,
        1,
        mutationCommand(admin, deactivateKey, deactivateScope, deactivateFingerprint),
      ),
      { ...deactivated, replayed: true },
    );

    const reactivateScope = playerMutationScope("reactivate", playerId);
    const reactivateFingerprint = playerMutationFingerprint({
      action: "reactivate",
      playerId,
      expectedRevision: 2,
    });
    const staleActor = { ...admin, id: randomUUID() };
    assert.deepEqual(
      await repository.reactivate(
        playerId,
        2,
        mutationCommand(
          staleActor,
          uniqueKey("rollback-reactivate"),
          reactivateScope,
          reactivateFingerprint,
        ),
      ),
      { type: "session-stale" },
    );
    const afterFailedReactivation = await repository.findById(playerId);
    assert.equal(afterFailedReactivation?.status, "INACTIVE");
    assert.equal(afterFailedReactivation?.revision, 2);
    assert.equal(await mappingRepository.findPublicUuidByLegacyId(input.legacyId!), null);

    const reactivateKey = uniqueKey("player-reactivate");
    const reactivated = await repository.reactivate(
      playerId,
      2,
      mutationCommand(admin, reactivateKey, reactivateScope, reactivateFingerprint),
    );
    assert.equal(reactivated.type, "success");
    if (reactivated.type !== "success") throw new Error("Player reactivation did not succeed.");
    assert.equal(reactivated.revision, 3);
    assert.equal(reactivated.response.player.status, "ACTIVE");
    assert.equal(reactivated.response.player.deactivatedAt, null);
    assert.deepEqual(
      await repository.reactivate(
        playerId,
        2,
        mutationCommand(admin, reactivateKey, reactivateScope, reactivateFingerprint),
      ),
      { ...reactivated, replayed: true },
    );
    const staleReactivation = await repository.reactivate(
      playerId,
      2,
      mutationCommand(
        admin,
        uniqueKey("stale-reactivate"),
        reactivateScope,
        reactivateFingerprint,
      ),
    );
    assert.deepEqual(staleReactivation, { type: "precondition-failed", currentRevision: 3 });
    assert.equal(await mappingRepository.findPublicUuidByLegacyId(input.legacyId!), playerId);
    assert.equal((await publicRepository.search(updatedInput.nickname))[0]?.id, playerId);

    for (const [index, lifecycleAccountState] of [
      { status: "PENDING" as const, deletedAt: null },
      { status: "REJECTED" as const, deletedAt: null },
      { status: "REJECTED" as const, deletedAt: new Date() },
    ].entries()) {
      const lifecycleAccountId = randomUUID();
      const lifecycleLoginId = `player_lifecycle_${index}_${suffix}`;
      const lifecyclePlayerId = randomUUID();
      const lifecycleDeactivatedAt = new Date();
      await database.insert(userAccounts).values({
        id: lifecycleAccountId,
        loginId: lifecycleLoginId,
        loginIdNormalized: lifecycleLoginId,
        passwordHash: null,
        role: "USER",
        status: lifecycleAccountState.status,
        deletedAt: lifecycleAccountState.deletedAt,
      });
      await database.insert(players).values({
        id: lifecyclePlayerId,
        userAccountId: lifecycleAccountId,
        memberName: `계정 lifecycle 회원 ${index}`,
        memberNameNormalized: `계정 lifecycle 회원 ${index}`,
        nickname: `Lifecycle${index}${suffix}`,
        nicknameNormalized: `lifecycle${index}${suffix}`,
        tagLine: "S02",
        tagLineNormalized: "s02",
        status: "INACTIVE",
        deactivatedAt: lifecycleDeactivatedAt,
        accountLifecycleDeactivatedAt: lifecycleDeactivatedAt,
      });
      const lifecycleScope = playerMutationScope("reactivate", lifecyclePlayerId);
      assert.deepEqual(
        await repository.reactivate(
          lifecyclePlayerId,
          0,
          mutationCommand(
            admin,
            uniqueKey(`lifecycle-reactivate-${index}`),
            lifecycleScope,
            playerMutationFingerprint({
              action: "reactivate",
              playerId: lifecyclePlayerId,
              expectedRevision: 0,
            }),
          ),
        ),
        { type: "conflict", reason: "ACCOUNT_LIFECYCLE_MANAGED" },
      );
      const lifecyclePlayer = (await database.select().from(players).where(
        eq(players.id, lifecyclePlayerId),
      ))[0];
      assert.equal(lifecyclePlayer?.status, "INACTIVE");
      assert.ok(lifecyclePlayer?.accountLifecycleDeactivatedAt);
      assert.equal(lifecyclePlayer?.revision, 0);
    }

    const auditCount = await database
      .select({ value: count() })
      .from(auditEvents)
      .where(eq(auditEvents.targetId, playerId));
    assert.equal(auditCount[0]?.value, 4);

    const rollbackInput = playerInput(`${suffix}rollback`, null);
    assert.deepEqual(
      await repository.create(
        rollbackInput,
        mutationCommand(
          { ...admin, id: randomUUID() },
          uniqueKey("rollback-create"),
          createScope,
          playerMutationFingerprint({ action: "create", player: rollbackInput }),
        ),
      ),
      { type: "session-stale" },
    );
    const rolledBack = await database
      .select({ value: count() })
      .from(players)
      .where(eq(players.nicknameNormalized, rollbackInput.nickname.toLocaleLowerCase("ko-KR")));
    assert.equal(rolledBack[0]?.value, 0);

    await assert.rejects(
      database.insert(players).values({
        id: randomUUID(),
        legacyId: 0,
        memberName: "잘못된 번호",
        memberNameNormalized: "잘못된 번호",
        nickname: `InvalidLegacy${suffix}`,
        nicknameNormalized: `invalidlegacy${suffix}`,
        tagLine: "S02",
        tagLineNormalized: "s02",
      }),
      (error: unknown) => {
        let current: unknown = error;
        while (current && typeof current === "object") {
          if ((current as { code?: string }).code === "23514") return true;
          current = (current as { cause?: unknown }).cause;
        }
        return false;
      },
    );

    const receiptCount = await database
      .select({ value: count() })
      .from(playerMutationReceipts)
      .where(eq(playerMutationReceipts.actorUserAccountId, admin.id));
    assert.equal(receiptCount[0]?.value, 6);
    const rawKeySearch = await database.execute(
      sql`select 1 from registry.player_mutation_receipts where response_json::text like ${`%${createKey}%`}`,
    );
    assert.equal(rawKeySearch.rows.length, 0);

    const raceActor = account(`player_race_${suffix}`, "ADMIN");
    await database.insert(userAccounts).values(accountRow(raceActor));
    await database.insert(authSessions).values({
      id: raceActor.sessionId,
      tokenHash: randomBytes(32),
      userAccountId: raceActor.id,
      authVersion: raceActor.authVersion,
      role: raceActor.role,
      purpose: "ADMIN",
      totpVerifiedAt: new Date(),
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });
    const raceInput = playerInput(`${suffix}revoked`, null);
    const raceKey = uniqueKey("player-revoke-race");
    const raceBlocker = await pool.connect();
    try {
      await raceBlocker.query("begin");
      await raceBlocker.query("select id from auth.user_accounts where id = $1 for update", [raceActor.id]);
      const pendingMutation = repository.create(
        raceInput,
        mutationCommand(
          raceActor,
          raceKey,
          createScope,
          playerMutationFingerprint({ action: "create", player: raceInput }),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
      await database.update(authSessions).set({ revokedAt: new Date() }).where(
        eq(authSessions.id, raceActor.sessionId),
      );
      await raceBlocker.query("commit");
      assert.deepEqual(await pendingMutation, { type: "session-stale" });
    } finally {
      await raceBlocker.query("rollback").catch(() => undefined);
      raceBlocker.release();
    }
    assert.equal((await database.select({ value: count() }).from(players).where(
      eq(players.nicknameNormalized, raceInput.nickname.toLocaleLowerCase("ko-KR")),
    ))[0]?.value, 0);
    assert.equal((await database.select({ value: count() }).from(playerMutationReceipts).where(
      eq(playerMutationReceipts.actorUserAccountId, raceActor.id),
    ))[0]?.value, 0);

    const accountPurposeActor = account(`player_account_purpose_${suffix}`, "ADMIN");
    await database.insert(userAccounts).values(accountRow(accountPurposeActor));
    await database.insert(authSessions).values({
      id: accountPurposeActor.sessionId,
      tokenHash: randomBytes(32),
      userAccountId: accountPurposeActor.id,
      authVersion: 0,
      role: "ADMIN",
      purpose: "ACCOUNT",
      totpVerifiedAt: null,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    });
    const wrongPurposeInput = playerInput(`${suffix}wrongpurpose`, null);
    assert.deepEqual(
      await repository.create(
        wrongPurposeInput,
        mutationCommand(
          accountPurposeActor,
          uniqueKey("player-account-purpose"),
          createScope,
          playerMutationFingerprint({ action: "create", player: wrongPurposeInput }),
        ),
      ),
      { type: "session-stale" },
    );

    const expiryActor = account(`player_expiry_${suffix}`, "ADMIN");
    await database.insert(userAccounts).values(accountRow(expiryActor));
    await database.insert(authSessions).values({
      id: expiryActor.sessionId,
      tokenHash: randomBytes(32),
      userAccountId: expiryActor.id,
      authVersion: 0,
      role: "ADMIN",
      purpose: "ADMIN",
      totpVerifiedAt: new Date(),
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 350),
    });
    const expiryInput = playerInput(`${suffix}expiredwhilewaiting`, null);
    const expiryBlocker = await pool.connect();
    try {
      await expiryBlocker.query("begin");
      await expiryBlocker.query("select id from auth.user_accounts where id = $1 for update", [expiryActor.id]);
      const pendingMutation = repository.create(
        expiryInput,
        mutationCommand(
          expiryActor,
          uniqueKey("player-expiry-race"),
          createScope,
          playerMutationFingerprint({ action: "create", player: expiryInput }),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 600));
      await expiryBlocker.query("commit");
      assert.deepEqual(await pendingMutation, { type: "session-stale" });
    } finally {
      await expiryBlocker.query("rollback").catch(() => undefined);
      expiryBlocker.release();
    }
  } finally {
    await pool.end();
  }
});
