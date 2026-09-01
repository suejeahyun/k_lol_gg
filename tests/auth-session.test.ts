import assert from "node:assert/strict";
import test from "node:test";
import { authorizeSession } from "../src/modules/auth/application/authorize-session";
import { sessionMatchesAccount } from "../src/modules/auth/application/validate-session-account";
import { JoseSessionCodec } from "../src/modules/auth/infrastructure/jose-session-codec";

const SECRET = "unit-test-session-secret-with-at-least-32-bytes";
const NOW = Date.UTC(2026, 8, 1, 0, 0, 0);

const seed = {
  userId: "fixture-admin",
  role: "ADMIN" as const,
  authVersion: 1,
  adminTotpVerified: true,
  source: "fixture" as const,
};

test("session codec round-trips only the minimal signed claims", async () => {
  const codec = new JoseSessionCodec(SECRET);
  const token = await codec.encode(seed, { nowMs: NOW, ttlSeconds: 60 });
  const session = await codec.decode(token, { nowMs: NOW + 1_000 });

  assert.deepEqual(session, { ...seed, expiresAt: NOW + 60_000 });
});

test("session codec rejects tampering, expiry, and a different secret", async () => {
  const codec = new JoseSessionCodec(SECRET);
  const token = await codec.encode(seed, { nowMs: NOW, ttlSeconds: 30 });
  const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

  assert.equal(await codec.decode(tampered, { nowMs: NOW }), null);
  assert.equal(await codec.decode(token, { nowMs: NOW + 31_000 }), null);
  assert.equal(await new JoseSessionCodec(`${SECRET}-other`).decode(token, { nowMs: NOW }), null);
});

test("authorization distinguishes missing role and missing admin TOTP", () => {
  const session = { ...seed, expiresAt: NOW + 60_000 };
  assert.equal(authorizeSession(null, "ADMIN").allowed, false);
  assert.deepEqual(authorizeSession({ ...session, role: "USER" }, "ADMIN"), {
    allowed: false,
    reason: "FORBIDDEN",
  });
  assert.deepEqual(authorizeSession({ ...session, adminTotpVerified: false }, "ADMIN"), {
    allowed: false,
    reason: "TOTP_REQUIRED",
  });
  assert.equal(authorizeSession({ ...session, role: "SUPER_ADMIN" }, "ADMIN").allowed, true);
});

test("session is revoked when account state, role, or authVersion changes", () => {
  const session = { ...seed, expiresAt: NOW + 60_000 };
  const account = {
    id: seed.userId,
    loginId: "e2e_admin",
    passwordHash: "not-used-by-this-test",
    role: seed.role,
    status: "APPROVED" as const,
    authVersion: seed.authVersion,
    adminTotpEnabled: true,
    adminTotpSecret: null,
  };

  assert.equal(sessionMatchesAccount(session, account), true);
  assert.equal(sessionMatchesAccount(session, { ...account, authVersion: 2 }), false);
  assert.equal(sessionMatchesAccount(session, { ...account, status: "SUSPENDED" }), false);
  assert.equal(sessionMatchesAccount(session, { ...account, role: "SUPER_ADMIN" }), false);
  assert.equal(sessionMatchesAccount(session, { ...account, adminTotpEnabled: false }), false);
});
