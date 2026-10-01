import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { PostgresMatchTransactionAuthorizer } from "../../src/modules/matches/infrastructure/postgres-match-transaction-authorizer";
import { MatchServiceError } from "../../src/modules/matches/domain/match";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

test("match writes accept password-only administrators and enforce current session boundaries", async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const authorizer = new PostgresMatchTransactionAuthorizer();
  try {
    await applyMigrations(database);
    for (const scenario of [
      { name: "ADMIN without TOTP", role: "ADMIN", allowed: true },
      { name: "SUPER_ADMIN without TOTP", role: "SUPER_ADMIN", allowed: true },
      { name: "existing TOTP session", role: "ADMIN", totp: true, allowed: true },
      { name: "ACCOUNT cookie cannot authorize admin import", role: "ADMIN", purpose: "ACCOUNT" },
      { name: "ordinary member", role: "USER", purpose: "ACCOUNT" },
      { name: "revoked session", role: "ADMIN", revoked: true },
      { name: "expired session despite earlier request time", role: "ADMIN", expired: true },
      { name: "stale auth version", role: "ADMIN", stale: true },
      { name: "changed role", role: "ADMIN", sessionRole: "SUPER_ADMIN" },
      { name: "suspended account", role: "ADMIN", status: "SUSPENDED" },
      { name: "deleted account", role: "ADMIN", deleted: true },
      { name: "password reset required", role: "ADMIN", password: true },
      { name: "fixture session cannot write", role: "ADMIN", fixture: true },
      { name: "approved member submission", role: "USER", purpose: "ACCOUNT", requiredRole: "USER", allowed: true },
    ]) {
      await t.test(scenario.name, async () => {
        const accountId = randomUUID();
        const sessionId = randomUUID();
        await pool.query(`INSERT INTO auth.user_accounts
          (id,login_id,login_id_normalized,role,status,must_change_password,deleted_at)
          VALUES ($1::uuid,$1::text,$1::text,$2,$3,$4,$5)`,
        [accountId, scenario.role, scenario.status ?? "APPROVED", scenario.password ?? false, scenario.deleted ? new Date() : null]);
        await pool.query(`INSERT INTO auth.sessions
          (id,user_account_id,token_hash,auth_version,role,purpose,totp_verified_at,kind,fixture_id,issued_at,expires_at,revoked_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()-interval '2 hours',
            now()+$10::interval,$11)`,
        [sessionId, accountId, randomBytes(32), scenario.stale ? 1 : 0, scenario.sessionRole ?? scenario.role,
          scenario.purpose ?? "ADMIN", scenario.totp ? new Date() : null,
          scenario.fixture ? "E2E_FIXTURE" : "USER", scenario.fixture ? "synthetic" : null,
          scenario.expired ? "-1 minute" : "1 hour", scenario.revoked ? new Date() : null]);
        const actor = scenario.requiredRole === "USER"
          ? { userAccountId: accountId, sessionId, purpose: "ACCOUNT" as const, requiredRole: "USER" as const }
          : { userAccountId: accountId, sessionId, purpose: "ADMIN" as const, requiredRole: "ADMIN" as const };
        const authorize = () => database.transaction((tx) => authorizer.assertAuthorized(tx, actor, new Date(Date.now() - 3_600_000)));
        if (scenario.allowed) await authorize();
        else await assert.rejects(authorize, MatchServiceError);
      });
    }
  } finally { await pool.end(); }
});
