import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { eq, sql } from "drizzle-orm";

import { PostgresPlayerRepository } from "../../src/modules/players/infrastructure/postgres-player-repository";
import { PostgresAuthRepository } from "../../src/modules/auth/infrastructure/postgres-auth-repository";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import {
  adminTotpCredentials,
  auditEvents,
  authSessions,
  players,
  userAccounts,
} from "../../src/platform/db/schema/index";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";
import { withTransaction } from "../../src/platform/db/transaction";

function postgresError(code: string) {
  return (error: unknown) => {
    let current: unknown = error;
    while (current && typeof current === "object") {
      if ((current as { code?: string }).code === code) return true;
      current = (current as { cause?: unknown }).cause;
    }
    return false;
  };
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function approvedAccount(loginId: string, role: "USER" | "ADMIN" | "SUPER_ADMIN" = "USER") {
  return {
    id: randomUUID(),
    loginId,
    loginIdNormalized: loginId.normalize("NFKC").toLocaleLowerCase("ko-KR"),
    passwordHash: "$argon2id$v=19$synthetic-test-hash",
    role,
    status: "APPROVED" as const,
  };
}

test("four guards reject unsafe database targets", () => {
  const safe = "postgresql://test:test@127.0.0.1:5432/klol_v2_test_guard";

  assert.throws(
    () => assertSafeTestDatabase({ connectionString: safe, nodeEnv: "development", testMode: "true" }),
    /NODE_ENV=test/,
  );
  assert.throws(
    () => assertSafeTestDatabase({ connectionString: safe, nodeEnv: "test", testMode: undefined }),
    /V2_DB_TEST_MODE=true/,
  );
  assert.throws(
    () =>
      assertSafeTestDatabase({
        connectionString: "postgresql://test:test@database.example.com/klol_v2_test_guard",
        nodeEnv: "test",
        testMode: "true",
      }),
    /non-loopback/,
  );
  assert.throws(
    () =>
      assertSafeTestDatabase({
        connectionString: "postgresql://test:test@127.0.0.1:5432/production",
        nodeEnv: "test",
        testMode: "true",
      }),
    /klol_v2_test_/,
  );
  assert.doesNotThrow(() =>
    assertSafeTestDatabase({ connectionString: safe, nodeEnv: "test", testMode: "true" }),
  );
});

test("migrations, constraints, repository, and transaction contracts hold on PostgreSQL 18", async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.V2_DB_TEST_MODE,
  });

  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });

  try {
    await t.test("forward migration preserves existing player rows and is idempotent", async () => {
      const partialMigrationFolder = await mkdtemp(join(tmpdir(), "klol-v2-migrations-"));
      const partialMetaFolder = join(partialMigrationFolder, "meta");
      const preexistingPlayerId = randomUUID();
      const preexistingAdminId = randomUUID();
      const preexistingSessionId = randomUUID();
      const preexistingNonTotpSessionId = randomUUID();
      const invisibleLegacyPlayerId = randomUUID();
      const nonNfkcLegacyPlayerId = randomUUID();
      const kaithiFormatLegacyPlayerId = randomUUID();
      try {
        await mkdir(partialMetaFolder);
        await copyFile(new URL("../../drizzle/0000_jazzy_genesis.sql", import.meta.url), join(partialMigrationFolder, "0000_jazzy_genesis.sql"));
        await copyFile(new URL("../../drizzle/0001_nappy_iron_fist.sql", import.meta.url), join(partialMigrationFolder, "0001_nappy_iron_fist.sql"));
        await copyFile(new URL("../../drizzle/0002_player_registry_s02.sql", import.meta.url), join(partialMigrationFolder, "0002_player_registry_s02.sql"));
        await copyFile(new URL("../../drizzle/0003_cooing_wolf_cub.sql", import.meta.url), join(partialMigrationFolder, "0003_cooing_wolf_cub.sql"));
        const journal = JSON.parse(await readFile(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8")) as { entries: unknown[]; version: string; dialect: string };
        await writeFile(
          join(partialMetaFolder, "_journal.json"),
          JSON.stringify({ ...journal, entries: journal.entries.slice(0, 4) }),
          "utf8",
        );

        await applyMigrations(database, partialMigrationFolder);
        await pool.query(
          `insert into registry.players
             (id, member_name, member_name_normalized, nickname, nickname_normalized, tag_line, tag_line_normalized)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [preexistingPlayerId, "이관 전 합성 회원", "이관 전 합성 회원", "BeforeMigration", "beforemigration", "V1", "v1"],
        );
        await pool.query(
          `insert into auth.user_accounts
             (id, login_id, login_id_normalized, password_hash, role, status,
              terms_accepted_at, privacy_accepted_at)
           values ($1, $2, $2, $3, 'ADMIN', 'APPROVED', now(), now())`,
          [preexistingAdminId, `upgrade_admin_${preexistingAdminId.slice(0, 8)}`, "$2b$12$syntheticLegacyHashForUpgradeOnly000000000000000000000"],
        );
        await pool.query(
          `insert into auth.sessions
             (id, token_hash, user_account_id, auth_version, role, totp_verified_at,
              issued_at, expires_at)
           values ($1, $2, $3, 0, 'ADMIN', now(), now(), now() + interval '1 hour')`,
          [preexistingSessionId, Buffer.alloc(32, 0x44), preexistingAdminId],
        );
        await pool.query(
          `insert into auth.sessions
             (id, token_hash, user_account_id, auth_version, role, totp_verified_at,
              issued_at, expires_at)
           values ($1, $2, $3, 0, 'ADMIN', null, now(), now() + interval '1 hour')`,
          [preexistingNonTotpSessionId, Buffer.alloc(32, 0x45), preexistingAdminId],
        );

        await pool.query(
          `insert into registry.players
             (id, member_name, member_name_normalized, nickname, nickname_normalized, tag_line, tag_line_normalized)
           values
             ($1, '이관 전 숨김 문자 회원', '이관 전 숨김 문자 회원', $2, $3, 'V2A', 'v2a'),
             ($4, '이관 전 비정규 회원', '이관 전 비정규 회원', $5, $6, 'V2B', 'v2b'),
             ($7, '이관 전 카이티 형식문자 회원', '이관 전 카이티 형식문자 회원', $8, $9, 'V2C', 'v2c')`,
          [
            invisibleLegacyPlayerId,
            "Invisible\u200bLegacy",
            "invisible\u200blegacy",
            nonNfkcLegacyPlayerId,
            "Cafe\u0301Legacy",
            "cafélegacy",
            kaithiFormatLegacyPlayerId,
            "Kaithi\u{110bd}Legacy",
            "kaithi\u{110bd}legacy",
          ],
        );
        await assert.rejects(
          applyMigrations(database),
          /identity preflight found non-NFKC or invisible-control legacy data/,
        );
        await pool.query(
          "delete from registry.players where id = any($1::uuid[])",
          [[invisibleLegacyPlayerId, nonNfkcLegacyPlayerId]],
        );
        await assert.rejects(
          applyMigrations(database),
          /identity preflight found non-NFKC or invisible-control legacy data/,
        );
        await pool.query("delete from registry.players where id = $1", [kaithiFormatLegacyPlayerId]);

        await applyMigrations(database);
        await applyMigrations(database);
      } finally {
        await rm(partialMigrationFolder, { force: true, recursive: true });
      }

      const migrationRows = await pool.query<{ count: number }>(
        "select count(*)::int as count from drizzle.__drizzle_migrations",
      );
      assert.equal(migrationRows.rows[0]?.count, 5);

      const upgradedSession = await pool.query<{
        purpose: string;
        revoked_at: Date | null;
        totp_verified_at: Date | null;
      }>(
        `select purpose, revoked_at, totp_verified_at
           from auth.sessions
          where id in ($1, $2)
          order by id`,
        [preexistingSessionId, preexistingNonTotpSessionId],
      );
      assert.equal(upgradedSession.rowCount, 2);
      for (const session of upgradedSession.rows) {
        assert.equal(session.purpose, "ACCOUNT");
        assert.ok(session.revoked_at);
        assert.equal(session.totp_verified_at, null);
      }

      const upgradedConsent = await pool.query<{ terms_version: string; privacy_version: string }>(
        `select terms_version, privacy_version
           from auth.user_accounts
          where id = $1`,
        [preexistingAdminId],
      );
      assert.deepEqual(upgradedConsent.rows[0], {
        terms_version: "legacy-unversioned",
        privacy_version: "legacy-unversioned",
      });

      const preservedRows = await pool.query<{ id: string; legacy_id: number | null }>(
        "select id, legacy_id from registry.players where id = $1",
        [preexistingPlayerId],
      );
      assert.deepEqual(preservedRows.rows, [{ id: preexistingPlayerId, legacy_id: null }]);

      const tableRows = await pool.query<{ schema_name: string; table_name: string }>(
        `select table_schema as schema_name, table_name
           from information_schema.tables
          where (table_schema, table_name) in (
            ('auth', 'user_accounts'),
            ('auth', 'admin_totp_credentials'),
            ('auth', 'sessions'),
            ('auth', 'login_rate_limit_buckets'),
            ('registry', 'players'),
            ('registry', 'player_mutation_receipts'),
            ('audit', 'events'),
            ('competition', 'seasons'),
            ('competition', 'season_applications'),
            ('competition', 'season_command_receipts')
          )`,
      );
      assert.equal(tableRows.rowCount, 10);

      const rateLimitColumns = await pool.query<{ column_name: string }>(
        `select column_name
           from information_schema.columns
          where table_schema = 'auth' and table_name = 'login_rate_limit_buckets'`,
      );
      const columnNames = new Set(rateLimitColumns.rows.map((row) => row.column_name));
      assert.equal(columnNames.has("login_id"), false);
      assert.equal(columnNames.has("ip_address"), false);
      assert.equal(columnNames.has("key_hash"), true);
    });

    await t.test("auth and TOTP constraints fail closed", async () => {
      const admin = approvedAccount("contract_admin", "ADMIN");
      await database.insert(userAccounts).values(admin);

      await assert.rejects(
        database.insert(userAccounts).values({
          ...approvedAccount("negative_auth_version"),
          authVersion: -1,
        }),
        postgresError("23514"),
      );

      await assert.rejects(
        database.insert(adminTotpCredentials).values({
          userAccountId: admin.id,
          secretCiphertext: Buffer.from("synthetic-ciphertext"),
          secretIv: Buffer.alloc(11),
          secretAuthTag: Buffer.alloc(16),
          keyVersion: 1,
        }),
        postgresError("23514"),
      );

      const issuedAt = new Date();
      await assert.rejects(
        database.insert(authSessions).values({
          id: randomUUID(),
          tokenHash: digest("fixture-session"),
          userAccountId: admin.id,
          authVersion: 0,
          role: "ADMIN",
          kind: "E2E_FIXTURE",
          issuedAt,
          expiresAt: new Date(issuedAt.getTime() + 60_000),
        }),
        postgresError("23514"),
      );
    });

    await t.test("database auth repository persists durable session, TOTP, and rate-limit state", async () => {
      const account = approvedAccount("durable_admin", "ADMIN");
      await database.insert(userAccounts).values(account);
      await database.insert(adminTotpCredentials).values({
        userAccountId: account.id,
        secretCiphertext: Buffer.from("synthetic-encrypted-secret"),
        secretIv: Buffer.alloc(12, 1),
        secretAuthTag: Buffer.alloc(16, 2),
        keyVersion: 7,
        enabledAt: new Date(),
      });

      const repository = new PostgresAuthRepository(database);
      assert.equal(repository.source, "database");
      assert.equal((await repository.findAccountById(account.id))?.authVersion, 0);
      assert.equal((await repository.findAccountByLoginId("  DURABLE_ADMIN  "))?.role, "ADMIN");

      const credential = await repository.getTotpCredential(account.id);
      assert.equal(credential?.secretIv.byteLength, 12);
      assert.equal(credential?.secretAuthTag.byteLength, 16);
      assert.equal(credential?.keyVersion, 7);

      const replayResults = await Promise.all([
        repository.consumeTotpStep(account.id, 1_000, new Date()),
        repository.consumeTotpStep(account.id, 1_000, new Date()),
      ]);
      assert.deepEqual(replayResults.toSorted(), [false, true]);
      assert.equal(await repository.consumeTotpStep(account.id, 999, new Date()), false);
      assert.equal(await repository.consumeTotpStep(account.id, 1_001, new Date()), true);

      const sessionId = randomUUID();
      const sessionDigest = digest("synthetic-raw-session-never-stored");
      const issuedAt = new Date();
      assert.equal(await repository.createSession({
        id: sessionId,
        tokenHash: sessionDigest,
        userAccountId: account.id,
        authVersion: 0,
        role: "ADMIN",
        purpose: "ADMIN",
        totpVerifiedAt: issuedAt,
        issuedAt,
        expiresAt: new Date(issuedAt.getTime() + 60_000),
      }), true);
      assert.equal(
        (await repository.findActiveSession(sessionId, sessionDigest, issuedAt))?.sessionId,
        sessionId,
      );
      assert.equal(
        await repository.findActiveSession(randomUUID(), sessionDigest, issuedAt),
        null,
      );
      assert.equal(
        await repository.findActiveSession(sessionId, digest("tampered-session-token"), issuedAt),
        null,
      );

      assert.equal(await repository.revokeSession(sessionId, new Date()), true);
      assert.equal(await repository.revokeSession(sessionId, new Date()), false);
      assert.equal(await repository.findActiveSession(sessionId, sessionDigest, issuedAt), null);

      const replacementSessionId = randomUUID();
      const replacementDigest = digest("replacement-session");
      assert.equal(await repository.createSession({
        id: replacementSessionId,
        tokenHash: replacementDigest,
        userAccountId: account.id,
        authVersion: 0,
        role: "ADMIN",
        purpose: "ADMIN",
        totpVerifiedAt: issuedAt,
        issuedAt,
        expiresAt: new Date(issuedAt.getTime() + 60_000),
      }), true);

      await database
        .update(userAccounts)
        .set({ authVersion: sql`${userAccounts.authVersion} + 1` })
        .where(eq(userAccounts.id, account.id));
      assert.equal(
        await repository.findActiveSession(replacementSessionId, replacementDigest, issuedAt),
        null,
      );

      const statusAccount = approvedAccount("status_changed_admin", "ADMIN");
      await database.insert(userAccounts).values(statusAccount);
      const statusSessionId = randomUUID();
      const statusDigest = digest("status-change-session");
      assert.equal(await repository.createSession({
        id: statusSessionId,
        tokenHash: statusDigest,
        userAccountId: statusAccount.id,
        authVersion: 0,
        role: "ADMIN",
        purpose: "ADMIN",
        totpVerifiedAt: issuedAt,
        issuedAt,
        expiresAt: new Date(issuedAt.getTime() + 60_000),
      }), true);
      await database
        .update(userAccounts)
        .set({ status: "SUSPENDED" })
        .where(eq(userAccounts.id, statusAccount.id));
      assert.equal(
        await repository.findActiveSession(statusSessionId, statusDigest, issuedAt),
        null,
      );
      assert.equal(await repository.createSession({
        id: randomUUID(),
        tokenHash: digest("suspended-account-session"),
        userAccountId: statusAccount.id,
        authVersion: 0,
        role: "ADMIN",
        purpose: "ADMIN",
        totpVerifiedAt: issuedAt,
        issuedAt,
        expiresAt: new Date(issuedAt.getTime() + 60_000),
      }), false);

      const roleAccount = approvedAccount("role_changed_admin", "ADMIN");
      await database.insert(userAccounts).values(roleAccount);
      const roleSessionId = randomUUID();
      const roleDigest = digest("role-change-session");
      assert.equal(await repository.createSession({
        id: roleSessionId,
        tokenHash: roleDigest,
        userAccountId: roleAccount.id,
        authVersion: 0,
        role: "ADMIN",
        purpose: "ADMIN",
        totpVerifiedAt: issuedAt,
        issuedAt,
        expiresAt: new Date(issuedAt.getTime() + 60_000),
      }), true);
      await database
        .update(userAccounts)
        .set({ role: "SUPER_ADMIN" })
        .where(eq(userAccounts.id, roleAccount.id));
      assert.equal(
        await repository.findActiveSession(roleSessionId, roleDigest, issuedAt),
        null,
      );

      const now = new Date();
      const windowStartedAt = new Date(now.getTime() - 10_000);
      const blockUntil = new Date(now.getTime() + 60_000);
      const expiresAt = new Date(now.getTime() + 120_000);
      const rateKey = digest("peppered-login-id");
      const first = await repository.recordLoginAttempt({
        scope: "LOGIN_ID_HASH",
        keyHash: rateKey,
        windowStartedAt,
        now,
        expiresAt,
        blockUntil,
        limit: 3,
      });
      const second = await repository.recordLoginAttempt({
        scope: "LOGIN_ID_HASH",
        keyHash: rateKey,
        windowStartedAt,
        now,
        expiresAt,
        blockUntil,
        limit: 3,
      });
      const third = await repository.recordLoginAttempt({
        scope: "LOGIN_ID_HASH",
        keyHash: rateKey,
        windowStartedAt,
        now,
        expiresAt,
        blockUntil,
        limit: 3,
      });
      const fourth = await repository.recordLoginAttempt({
        scope: "LOGIN_ID_HASH",
        keyHash: rateKey,
        windowStartedAt,
        now,
        expiresAt,
        blockUntil,
        limit: 3,
      });
      assert.deepEqual(
        [first.attemptCount, second.attemptCount, third.attemptCount, fourth.attemptCount],
        [1, 2, 3, 4],
      );
      assert.equal(first.blockedUntil, null);
      assert.equal(third.blockedUntil, null);
      assert.equal(fourth.blockedUntil?.getTime(), blockUntil.getTime());

      const parallelWindow = new Date(now.getTime());
      const parallelResults = await Promise.all(
        Array.from({ length: 5 }, () =>
          repository.recordLoginAttempt({
            scope: "IP_HASH",
            keyHash: digest("peppered-ip"),
            windowStartedAt: parallelWindow,
            now,
            expiresAt,
            blockUntil,
            limit: 4,
          }),
        ),
      );
      assert.deepEqual(
        parallelResults.map((record) => record.attemptCount).toSorted((left, right) => left - right),
        [1, 2, 3, 4, 5],
      );
      assert.deepEqual(
        parallelResults
          .filter((record) => record.blockedUntil !== null)
          .map((record) => record.attemptCount),
        [5],
      );

      const historicalNow = new Date(now.getTime() - 180_000);
      await repository.recordLoginAttempt({
        scope: "GLOBAL_HASH",
        keyHash: digest("global-rate-limit-key"),
        windowStartedAt: new Date(now.getTime() - 240_000),
        now: historicalNow,
        expiresAt: new Date(now.getTime() - 60_000),
        blockUntil: new Date(now.getTime() - 120_000),
        limit: 1,
      });
      assert.equal(await repository.createSession({
        id: randomUUID(),
        tokenHash: digest("expired-session"),
        userAccountId: account.id,
        authVersion: 1,
        role: "ADMIN",
        purpose: "ADMIN",
        totpVerifiedAt: historicalNow,
        issuedAt: new Date(now.getTime() - 120_000),
        expiresAt: new Date(now.getTime() - 60_000),
      }), true);

      const cleanup = await repository.cleanupExpiredAuthState({
        now,
        revokedBefore: new Date(now.getTime() - 86_400_000),
      });
      assert.ok(cleanup.sessionsDeleted >= 1);
      assert.ok(cleanup.rateLimitBucketsDeleted >= 1);
    });

    await t.test("registry uniqueness and lifecycle constraints are enforced", async () => {
      const firstPlayer = {
        id: randomUUID(),
        memberName: "합성 회원",
        memberNameNormalized: "합성 회원",
        nickname: "SkyFox",
        nicknameNormalized: "skyfox",
        tagLine: "V2",
        tagLineNormalized: "v2",
        currentTier: "PLATINUM IV",
      };
      await database.insert(players).values(firstPlayer);

      await assert.rejects(
        database.insert(players).values({ ...firstPlayer, id: randomUUID(), memberName: "다른 합성 회원" }),
        postgresError("23505"),
      );

      await assert.rejects(
        database.insert(players).values({
          id: randomUUID(),
          memberName: "비활성 합성 회원",
          memberNameNormalized: "비활성 합성 회원",
          nickname: "InactiveWithoutDate",
          nicknameNormalized: "inactivewithoutdate",
          tagLine: "V2",
          tagLineNormalized: "v2",
          status: "INACTIVE",
        }),
        postgresError("23514"),
      );
    });

    await t.test("PostgresPlayerRepository returns only public active projections", async () => {
      const activeId = randomUUID();
      const inactiveId = randomUUID();
      await database.insert(players).values([
        {
          id: activeId,
          memberName: "공개되지 않을 회원명",
          memberNameNormalized: "공개되지 않을 회원명",
          nickname: "LilacStar",
          nicknameNormalized: "lilacstar",
          tagLine: "KLOL",
          tagLineNormalized: "klol",
          currentTier: "EMERALD III",
        },
        {
          id: inactiveId,
          memberName: "비활성 회원",
          memberNameNormalized: "비활성 회원",
          nickname: "DormantPlayer",
          nicknameNormalized: "dormantplayer",
          tagLine: "KLOL",
          tagLineNormalized: "klol",
          status: "INACTIVE",
          deactivatedAt: new Date(),
        },
      ]);

      const repository = new PostgresPlayerRepository(database);
      const byNickname = await repository.search("  LILAC  ");
      const byRiotId = await repository.search("lilacstar#klol");
      const byPrivateMemberName = await repository.search("공개되지 않을 회원명");
      const wildcardLiteral = await repository.search("%");

      assert.deepEqual(byNickname, [
        {
          id: activeId,
          displayName: "LilacStar",
          riotId: "LilacStar#KLOL",
          mainPosition: null,
          tier: "EMERALD III",
          recentMatches: null,
          winRate: null,
        },
      ]);
      assert.deepEqual(byRiotId, byNickname);
      assert.deepEqual(byPrivateMemberName, []);
      assert.deepEqual(wildcardLiteral, []);
      assert.equal(byNickname.some((player) => player.id === inactiveId), false);
      assert.equal("memberName" in byNickname[0]!, false);
    });

    await t.test("domain change and audit append commit or roll back atomically", async () => {
      const rolledBackPlayerId = randomUUID();
      await assert.rejects(
        withTransaction(database, async (transaction) => {
          await transaction.insert(players).values({
            id: rolledBackPlayerId,
            memberName: "롤백 합성 회원",
            memberNameNormalized: "롤백 합성 회원",
            nickname: "RollbackPlayer",
            nicknameNormalized: "rollbackplayer",
            tagLine: "TEST",
            tagLineNormalized: "test",
          });
          await transaction.insert(auditEvents).values({
            requestId: randomUUID(),
            action: "PLAYER_CREATED",
            targetType: "PLAYER",
            targetId: rolledBackPlayerId,
            afterJson: { nickname: "RollbackPlayer" },
          });
          throw new Error("intentional transaction rollback");
        }),
        /intentional transaction rollback/,
      );

      const rolledBackRows = await database
        .select({ id: players.id })
        .from(players)
        .where(eq(players.id, rolledBackPlayerId));
      const rolledBackAudits = await database.execute(
        sql`select id from audit.events where target_id = ${rolledBackPlayerId}`,
      );
      assert.equal(rolledBackRows.length, 0);
      assert.equal(rolledBackAudits.rows.length, 0);

      const committedPlayerId = randomUUID();
      await withTransaction(database, async (transaction) => {
        await transaction.insert(players).values({
          id: committedPlayerId,
          memberName: "커밋 합성 회원",
          memberNameNormalized: "커밋 합성 회원",
          nickname: "CommittedPlayer",
          nicknameNormalized: "committedplayer",
          tagLine: "TEST",
          tagLineNormalized: "test",
        });
        await transaction.insert(auditEvents).values({
          requestId: randomUUID(),
          action: "PLAYER_CREATED",
          targetType: "PLAYER",
          targetId: committedPlayerId,
          afterJson: { nickname: "CommittedPlayer" },
        });
      });

      const committedRows = await database
        .select({ id: players.id })
        .from(players)
        .where(eq(players.id, committedPlayerId));
      const committedAudits = await database.execute(
        sql`select id from audit.events where target_id = ${committedPlayerId}`,
      );
      assert.equal(committedRows.length, 1);
      assert.equal(committedAudits.rows.length, 1);
    });
  } finally {
    await pool.end();
  }
});
