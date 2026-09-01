import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT } from "jose";
import { authorizeSession } from "../src/modules/auth/application/authorize-session";
import { sessionMatchesAccount } from "../src/modules/auth/application/validate-session-account";
import { JoseSessionCodec } from "../src/modules/auth/infrastructure/jose-session-codec";

const SECRET = "unit-test-session-secret-with-at-least-32-bytes";
const NOW = Date.UTC(2026, 8, 1, 0, 0, 0);
const SESSION_ID = "38d0b8a7-a0aa-4d64-8bc4-00e464ce787f";

const seed = {
  userId: "fixture-admin",
  role: "ADMIN" as const,
  authVersion: 1,
  adminTotpVerified: true,
  source: "fixture" as const,
};

test("session codec round-trips only the minimal signed claims", async () => {
  const codec = new JoseSessionCodec(SECRET);
  const token = await codec.encode(seed, { nowMs: NOW, ttlSeconds: 60, sessionId: SESSION_ID });
  const session = await codec.decode(token, { nowMs: NOW + 1_000 });

  assert.deepEqual(session, {
    ...seed,
    sessionId: SESSION_ID,
    issuedAt: NOW,
    expiresAt: NOW + 60_000,
  });
});

test("session codec generates a unique required jti for every issuance", async () => {
  const codec = new JoseSessionCodec(SECRET);
  const first = await codec.decode(await codec.encode(seed, { nowMs: NOW }), { nowMs: NOW });
  const second = await codec.decode(await codec.encode(seed, { nowMs: NOW }), { nowMs: NOW });

  assert.ok(first?.sessionId);
  assert.ok(second?.sessionId);
  assert.notEqual(first?.sessionId, second?.sessionId);
});

test("session codec rejects tampering, expiry, and a different secret", async () => {
  const codec = new JoseSessionCodec(SECRET);
  const token = await codec.encode(seed, { nowMs: NOW, ttlSeconds: 30 });
  const [header, payload, signature] = token.split(".");
  const tampered = `${header}.${payload}.${signature.startsWith("a") ? "b" : "a"}${signature.slice(1)}`;

  assert.equal(await codec.decode(tampered, { nowMs: NOW }), null);
  assert.equal(await codec.decode(token, { nowMs: NOW + 31_000 }), null);
  assert.equal(await new JoseSessionCodec(`${SECRET}-other`).decode(token, { nowMs: NOW }), null);
});

test("session codec requires iat and enforces the 30 minute lifetime contract", async () => {
  const codec = new JoseSessionCodec(SECRET);
  const key = new TextEncoder().encode(SECRET);
  const claims = {
    role: seed.role,
    authVersion: seed.authVersion,
    adminTotpVerified: seed.adminTotpVerified,
    source: seed.source,
  };
  const missingIssuedAt = await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: "local" })
    .setSubject(seed.userId)
    .setJti(SESSION_ID)
    .setIssuer("k-lol-gg-v2")
    .setAudience("k-lol-gg-v2-web")
    .setExpirationTime(Math.floor(NOW / 1000) + 60)
    .sign(key);
  const excessiveLifetime = await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: "local" })
    .setSubject(seed.userId)
    .setJti(SESSION_ID)
    .setIssuer("k-lol-gg-v2")
    .setAudience("k-lol-gg-v2-web")
    .setIssuedAt(Math.floor(NOW / 1000))
    .setExpirationTime(Math.floor(NOW / 1000) + 24 * 60 * 60)
    .sign(key);

  assert.equal(await codec.decode(missingIssuedAt, { nowMs: NOW }), null);
  assert.equal(await codec.decode(excessiveLifetime, { nowMs: NOW }), null);

  const missingJti = await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: "local" })
    .setSubject(seed.userId)
    .setIssuer("k-lol-gg-v2")
    .setAudience("k-lol-gg-v2-web")
    .setIssuedAt(Math.floor(NOW / 1000))
    .setExpirationTime(Math.floor(NOW / 1000) + 60)
    .sign(key);
  assert.equal(await codec.decode(missingJti, { nowMs: NOW }), null);
});

test("session codec pins issuer, audience, algorithm, and rejects future issuance", async () => {
  const codec = new JoseSessionCodec(SECRET);
  const key = new TextEncoder().encode(SECRET);
  const nowSeconds = Math.floor(NOW / 1000);
  const claims = {
    role: seed.role,
    authVersion: seed.authVersion,
    adminTotpVerified: seed.adminTotpVerified,
    source: seed.source,
  };
  const sign = (issuer: string, audience: string, algorithm: "HS256" | "HS384", issuedAt = nowSeconds) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: algorithm, typ: "JWT", kid: "local" })
      .setSubject(seed.userId)
      .setJti(SESSION_ID)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 60)
      .sign(key);

  assert.equal(await codec.decode(await sign("other-issuer", "k-lol-gg-v2-web", "HS256"), { nowMs: NOW }), null);
  assert.equal(await codec.decode(await sign("k-lol-gg-v2", "other-audience", "HS256"), { nowMs: NOW }), null);
  assert.equal(await codec.decode(await sign("k-lol-gg-v2", "k-lol-gg-v2-web", "HS384"), { nowMs: NOW }), null);
  assert.equal(await codec.decode(await sign("k-lol-gg-v2", "k-lol-gg-v2-web", "HS256", nowSeconds + 60), { nowMs: NOW }), null);
});

test("authorization distinguishes missing role and missing admin TOTP", () => {
  const session = {
    ...seed,
    sessionId: SESSION_ID,
    issuedAt: NOW,
    expiresAt: NOW + 60_000,
  };
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
  const session = {
    ...seed,
    sessionId: SESSION_ID,
    issuedAt: NOW,
    expiresAt: NOW + 60_000,
  };
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
