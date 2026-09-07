import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { and, eq, inArray } from "drizzle-orm";

import type { TotpMutationActor } from "../../src/modules/auth/application/ports/auth-repository";
import { PostgresAuthRepository } from "../../src/modules/auth/infrastructure/postgres-auth-repository";
import {
  encryptTotpSecret,
  fingerprintTotpCredential,
} from "../../src/modules/auth/infrastructure/totp-envelope";
import { generateTotpSecret } from "../../src/modules/auth/infrastructure/totp";
import { parseTotpEncryptionKeyring } from "../../src/modules/auth/infrastructure/versioned-secret-keyring";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import {
  adminTotpCredentials,
  auditEvents,
  authSessions,
  userAccounts,
} from "../../src/platform/db/schema/index";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function account(loginId: string, role: "USER" | "ADMIN" | "SUPER_ADMIN") {
  return {
    id: randomUUID(),
    loginId,
    loginIdNormalized: loginId,
    passwordHash: "$argon2id$v=19$synthetic-test-hash",
    role,
    status: "APPROVED" as const,
  };
}

test("administrator TOTP lifecycle is serialized, audited, and rolled back atomically", async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.V2_DB_TEST_MODE,
  });

  const { database, pool } = createDatabaseHandle(connectionString, { max: 6 });
  const keyring = parseTotpEncryptionKeyring(JSON.stringify({
    current: 1,
    keys: { 1: randomBytes(32).toString("base64url") },
  }));
  const now = new Date();

  async function createSession(
    accountId: string,
    role: "USER" | "ADMIN" | "SUPER_ADMIN",
    authVersion: number,
    verified: boolean,
    label: string,
  ) {
    const repository = new PostgresAuthRepository(database);
    const id = randomUUID();
    const tokenHash = digest(`totp-lifecycle:${label}:${id}`);
    const created = await repository.createSession({
      id,
      tokenHash,
      userAccountId: accountId,
      authVersion,
      role,
      purpose: role === "USER" ? "ACCOUNT" : "ADMIN",
      totpVerifiedAt: verified ? now : null,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    });
    assert.equal(created, true);
    return { id, tokenHash };
  }

  function actorFor(
    accountId: string,
    sessionId: string,
    role: "ADMIN" | "SUPER_ADMIN",
    authVersion = 0,
  ): TotpMutationActor {
    return { userAccountId: accountId, sessionId, role, authVersion };
  }

  try {
    await applyMigrations(database);

    await t.test("a TOTP setup session that expires while queued cannot mutate security state", async () => {
      const admin = account(`totp_expiry_${randomBytes(4).toString("hex")}`, "ADMIN");
      await database.insert(userAccounts).values(admin);
      const sessionId = randomUUID();
      const issuedAt = new Date();
      await database.insert(authSessions).values({
        id: sessionId,
        tokenHash: digest(`totp-expiry:${sessionId}`),
        userAccountId: admin.id,
        authVersion: 0,
        role: "ADMIN",
        purpose: "ADMIN",
        totpVerifiedAt: null,
        issuedAt,
        expiresAt: new Date(issuedAt.getTime() + 350),
      });
      const repository = new PostgresAuthRepository(database);
      const blocker = await pool.connect();
      try {
        await blocker.query("begin");
        await blocker.query("select id from auth.user_accounts where id = $1 for update", [admin.id]);
        const pending = repository.beginOwnTotpSetup({
          actor: actorFor(admin.id, sessionId, "ADMIN"),
          envelope: encryptTotpSecret(admin.id, generateTotpSecret(), keyring),
          now: new Date(),
          requestId: randomUUID(),
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        await blocker.query("commit");
        assert.deepEqual(await pending, { ok: false, reason: "SESSION_STALE" });
      } finally {
        await blocker.query("rollback").catch(() => undefined);
        blocker.release();
      }
      assert.equal((await database.select().from(adminTotpCredentials).where(
        eq(adminTotpCredentials.userAccountId, admin.id),
      )).length, 0);
      assert.equal((await database.select().from(auditEvents).where(
        eq(auditEvents.targetId, admin.id),
      )).length, 0);
      const unchangedSession = (await database.select().from(authSessions).where(
        eq(authSessions.id, sessionId),
      ))[0];
      assert.equal(unchangedSession?.revokedAt, null);
      assert.equal(unchangedSession?.totpVerifiedAt, null);
    });

    await t.test("pending setup never rotates silently and explicit cancellation is auditable", async () => {
      const admin = account(`totp_setup_${randomBytes(4).toString("hex")}`, "ADMIN");
      await database.insert(userAccounts).values(admin);
      const session = await createSession(admin.id, "ADMIN", 0, false, "setup");
      const actor = actorFor(admin.id, session.id, "ADMIN");
      const repository = new PostgresAuthRepository(database);
      const firstSecret = generateTotpSecret();
      const secondSecret = generateTotpSecret();
      const firstEnvelope = encryptTotpSecret(admin.id, firstSecret, keyring);

      assert.deepEqual(await repository.beginOwnTotpSetup({
        actor,
        envelope: firstEnvelope,
        now,
        requestId: randomUUID(),
      }), { ok: true });
      assert.equal((await repository.findAccountById(admin.id))?.revision, 1);
      assert.deepEqual(await repository.beginOwnTotpSetup({
        actor,
        envelope: encryptTotpSecret(admin.id, secondSecret, keyring),
        now: new Date(now.getTime() + 1),
        requestId: randomUUID(),
      }), { ok: false, reason: "PENDING_SETUP_EXISTS" });

      const stored = await repository.getTotpCredential(admin.id);
      assert.ok(stored);
      assert.deepEqual(stored.secretCiphertext, firstEnvelope.secretCiphertext);
      assert.notDeepEqual(stored.secretCiphertext, Buffer.from(firstSecret));

      assert.deepEqual(await repository.cancelOwnPendingTotpSetup({
        actor,
        now: new Date(now.getTime() + 2),
        requestId: randomUUID(),
      }), { ok: true, cancelled: true });
      assert.equal(await repository.getTotpCredential(admin.id), null);
      assert.equal((await repository.findAccountById(admin.id))?.revision, 2);
      assert.deepEqual(await repository.cancelOwnPendingTotpSetup({
        actor,
        now: new Date(now.getTime() + 3),
        requestId: randomUUID(),
      }), { ok: true, cancelled: false });

      const actions = await database
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(eq(auditEvents.targetId, admin.id));
      assert.deepEqual(actions.map((row) => row.action).toSorted(), [
        "ADMIN_TOTP_SETUP_CANCELLED",
        "ADMIN_TOTP_SETUP_STARTED",
      ]);
    });

    await t.test("concurrent enable has one winner and revokes every session in its transaction", async () => {
      const admin = account(`totp_enable_${randomBytes(4).toString("hex")}`, "ADMIN");
      await database.insert(userAccounts).values(admin);
      const primary = await createSession(admin.id, "ADMIN", 0, false, "enable-primary");
      await createSession(admin.id, "ADMIN", 0, false, "enable-secondary");
      const actor = actorFor(admin.id, primary.id, "ADMIN");
      const repository = new PostgresAuthRepository(database);
      const secret = generateTotpSecret();
      await repository.beginOwnTotpSetup({
        actor,
        envelope: encryptTotpSecret(admin.id, secret, keyring),
        now,
        requestId: randomUUID(),
      });
      const credential = await repository.getTotpCredential(admin.id);
      assert.ok(credential);
      const expectedCredentialFingerprint = fingerprintTotpCredential(credential);

      const results = await Promise.all([
        repository.enableOwnTotp({
          actor,
          candidateStep: 10_000,
          expectedCredentialFingerprint,
          now: new Date(now.getTime() + 10),
          requestId: randomUUID(),
        }),
        repository.enableOwnTotp({
          actor,
          candidateStep: 10_000,
          expectedCredentialFingerprint,
          now: new Date(now.getTime() + 11),
          requestId: randomUUID(),
        }),
      ]);
      assert.equal(results.filter((result) => result.ok).length, 1);
      assert.equal(results.filter((result) => !result.ok).length, 1);

      const updatedAccount = await database
        .select({ authVersion: userAccounts.authVersion, revision: userAccounts.revision })
        .from(userAccounts)
        .where(eq(userAccounts.id, admin.id));
      assert.equal(updatedAccount[0]?.authVersion, 1);
      assert.equal(updatedAccount[0]?.revision, 2);
      const sessions = await database
        .select({ revokedAt: authSessions.revokedAt })
        .from(authSessions)
        .where(eq(authSessions.userAccountId, admin.id));
      assert.ok(sessions.length >= 2);
      assert.equal(sessions.every((session) => session.revokedAt instanceof Date), true);

      const enabled = await repository.getTotpCredential(admin.id);
      assert.ok(enabled?.enabledAt instanceof Date);
      assert.equal(enabled?.lastUsedStep, 10_000);
      const audits = await database
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(and(eq(auditEvents.targetId, admin.id), eq(auditEvents.action, "ADMIN_TOTP_ENABLED")));
      assert.equal(audits.length, 1);
    });

    await t.test("audit insertion failure rolls credential, version, and revocation back", async () => {
      const admin = account(`totp_rollback_${randomBytes(4).toString("hex")}`, "ADMIN");
      await database.insert(userAccounts).values(admin);
      const session = await createSession(admin.id, "ADMIN", 0, false, "rollback");
      const actor = actorFor(admin.id, session.id, "ADMIN");
      const repository = new PostgresAuthRepository(database);
      await repository.beginOwnTotpSetup({
        actor,
        envelope: encryptTotpSecret(admin.id, generateTotpSecret(), keyring),
        now,
        requestId: randomUUID(),
      });
      const credential = await repository.getTotpCredential(admin.id);
      assert.ok(credential);

      await assert.rejects(repository.enableOwnTotp({
        actor,
        candidateStep: 20_000,
        expectedCredentialFingerprint: fingerprintTotpCredential(credential),
        now: new Date(now.getTime() + 20),
        requestId: "not-a-uuid",
      }));

      const afterCredential = await repository.getTotpCredential(admin.id);
      assert.equal(afterCredential?.enabledAt, null);
      assert.equal(afterCredential?.lastUsedStep, null);
      const afterAccount = await repository.findAccountById(admin.id);
      assert.equal(afterAccount?.authVersion, 0);
      assert.equal(afterAccount?.revision, 1);
      assert.equal(
        (await repository.findActiveSession(session.id, session.tokenHash, new Date(now.getTime() + 21)))?.sessionId,
        session.id,
      );
    });

    await t.test("concurrent self-disable deletes the factor and revokes all sessions exactly once", async () => {
      const admin = account(`totp_disable_${randomBytes(4).toString("hex")}`, "SUPER_ADMIN");
      await database.insert(userAccounts).values(admin);
      const secret = generateTotpSecret();
      await database.insert(adminTotpCredentials).values({
        userAccountId: admin.id,
        ...encryptTotpSecret(admin.id, secret, keyring),
        enabledAt: now,
        lastUsedStep: 29_999,
      });
      const primary = await createSession(admin.id, "SUPER_ADMIN", 0, true, "disable-primary");
      await createSession(admin.id, "SUPER_ADMIN", 0, true, "disable-secondary");
      const actor = actorFor(admin.id, primary.id, "SUPER_ADMIN");
      const repository = new PostgresAuthRepository(database);
      const credential = await repository.getTotpCredential(admin.id);
      assert.ok(credential);
      const expectedCredentialFingerprint = fingerprintTotpCredential(credential);

      const results = await Promise.all([
        repository.disableOwnTotp({
          actor,
          candidateStep: 30_000,
          expectedCredentialFingerprint,
          now: new Date(now.getTime() + 30),
          requestId: randomUUID(),
        }),
        repository.disableOwnTotp({
          actor,
          candidateStep: 30_000,
          expectedCredentialFingerprint,
          now: new Date(now.getTime() + 31),
          requestId: randomUUID(),
        }),
      ]);
      assert.equal(results.filter((result) => result.ok).length, 1);
      assert.equal(await repository.getTotpCredential(admin.id), null);
      assert.equal((await repository.findAccountById(admin.id))?.authVersion, 1);
      assert.equal((await repository.findAccountById(admin.id))?.revision, 1);

      const sessions = await database
        .select({ revokedAt: authSessions.revokedAt })
        .from(authSessions)
        .where(eq(authSessions.userAccountId, admin.id));
      assert.equal(sessions.every((session) => session.revokedAt instanceof Date), true);
      const audits = await database
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(and(eq(auditEvents.targetId, admin.id), eq(auditEvents.action, "ADMIN_TOTP_DISABLED")));
      assert.equal(audits.length, 1);
    });

    await t.test("USER is rejected while SUPER_ADMIN self-setup remains allowed", async () => {
      const user = account(`totp_user_${randomBytes(4).toString("hex")}`, "USER");
      const superAdmin = account(`totp_super_${randomBytes(4).toString("hex")}`, "SUPER_ADMIN");
      await database.insert(userAccounts).values([user, superAdmin]);
      const userSession = await createSession(user.id, "USER", 0, false, "user-role");
      const superSession = await createSession(superAdmin.id, "SUPER_ADMIN", 0, false, "super-role");
      const repository = new PostgresAuthRepository(database);

      assert.deepEqual(await repository.beginOwnTotpSetup({
        actor: {
          userAccountId: user.id,
          sessionId: userSession.id,
          role: "ADMIN",
          authVersion: 0,
        },
        envelope: encryptTotpSecret(user.id, generateTotpSecret(), keyring),
        now,
        requestId: randomUUID(),
      }), { ok: false, reason: "ACCOUNT_NOT_ELIGIBLE" });
      assert.deepEqual(await repository.beginOwnTotpSetup({
        actor: actorFor(superAdmin.id, superSession.id, "SUPER_ADMIN"),
        envelope: encryptTotpSecret(superAdmin.id, generateTotpSecret(), keyring),
        now,
        requestId: randomUUID(),
      }), { ok: true });
    });

    const auditedTargets = await database
      .select({
        targetId: auditEvents.targetId,
        beforeJson: auditEvents.beforeJson,
        afterJson: auditEvents.afterJson,
        metadataJson: auditEvents.metadataJson,
      })
      .from(auditEvents)
      .where(inArray(auditEvents.action, [
        "ADMIN_TOTP_SETUP_STARTED",
        "ADMIN_TOTP_SETUP_CANCELLED",
        "ADMIN_TOTP_ENABLED",
        "ADMIN_TOTP_DISABLED",
      ]));
    const serializedAudit = JSON.stringify(auditedTargets);
    assert.equal(serializedAudit.includes("secretCiphertext"), false);
    assert.equal(serializedAudit.includes("manualSecret"), false);
    assert.equal(serializedAudit.includes("tokenHash"), false);
  } finally {
    await pool.end();
  }
});
