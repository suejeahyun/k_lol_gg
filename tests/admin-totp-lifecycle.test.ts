import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import {
  isEmptySecurityRequest,
  readTotpCodeRequest,
} from "../src/modules/auth/application/admin-security-http-contract";
import { isFixtureAuthEnvironmentEnabled } from "../src/modules/auth/infrastructure/fixture-runtime-policy";
import {
  JoseSessionCodec,
  MAXIMUM_SESSION_TOKEN_BYTES,
} from "../src/modules/auth/infrastructure/jose-session-codec";
import {
  clearedSessionCookieOptions,
  sessionCookieOptions,
} from "../src/modules/auth/infrastructure/session-cookie-policy";
import {
  encryptTotpSecret,
  fingerprintTotpCredential,
} from "../src/modules/auth/infrastructure/totp-envelope";
import { generateTotpSecret } from "../src/modules/auth/infrastructure/totp";
import { parseTotpEncryptionKeyring } from "../src/modules/auth/infrastructure/versioned-secret-keyring";

test("TOTP lifecycle payloads are self-only and accept exactly one six-digit code", () => {
  assert.equal(isEmptySecurityRequest({}), true);
  assert.equal(isEmptySecurityRequest({ targetUserAccountId: randomUUID() }), false);
  assert.equal(readTotpCodeRequest({ code: "012345" }), "012345");
  assert.equal(readTotpCodeRequest({ code: "12345" }), null);
  assert.equal(readTotpCodeRequest({ code: "123456", targetUserAccountId: randomUUID() }), null);
  assert.equal(readTotpCodeRequest(["123456"]), null);
});

test("generated TOTP secrets contain 160 random bits in canonical base32 form", () => {
  const first = generateTotpSecret();
  const second = generateTotpSecret();
  assert.match(first, /^[A-Z2-7]{32}$/);
  assert.match(second, /^[A-Z2-7]{32}$/);
  assert.notEqual(first, second);
});

test("TOTP credential fingerprint binds every encrypted envelope field", () => {
  const accountId = randomUUID();
  const key = randomBytes(32).toString("base64url");
  const keyring = parseTotpEncryptionKeyring(JSON.stringify({
    current: 1,
    keys: { 1: key },
  }));
  const encrypted = encryptTotpSecret(accountId, generateTotpSecret(), keyring);
  const credential = {
    userAccountId: accountId,
    ...encrypted,
  };
  const changedCiphertext = Buffer.from(encrypted.secretCiphertext);
  changedCiphertext[0] ^= 0x01;

  assert.deepEqual(fingerprintTotpCredential(credential), fingerprintTotpCredential(credential));
  assert.notDeepEqual(
    fingerprintTotpCredential(credential),
    fingerprintTotpCredential({ ...credential, secretCiphertext: changedCiphertext }),
  );
  assert.notDeepEqual(
    fingerprintTotpCredential(credential),
    fingerprintTotpCredential({ ...credential, userAccountId: randomUUID() }),
  );
});

test("fixture authentication is limited to explicit loopback non-Vercel runtimes", () => {
  const loopback = {
    NODE_ENV: "development",
    V2_TEST_AUTH_ENABLED: "true",
    V2_PUBLIC_ORIGIN: "http://127.0.0.1:3300",
  };
  assert.equal(isFixtureAuthEnvironmentEnabled(loopback), true);
  assert.equal(isFixtureAuthEnvironmentEnabled({ ...loopback, V2_PUBLIC_ORIGIN: "http://localhost:3300" }), true);
  assert.equal(isFixtureAuthEnvironmentEnabled({ ...loopback, NODE_ENV: "production" }), false);
  assert.equal(isFixtureAuthEnvironmentEnabled({ ...loopback, VERCEL: "1" }), false);
  assert.equal(isFixtureAuthEnvironmentEnabled({ ...loopback, VERCEL_ENV: "preview" }), false);
  assert.equal(isFixtureAuthEnvironmentEnabled({ ...loopback, VERCEL_URL: "preview.example.test" }), false);
  assert.equal(isFixtureAuthEnvironmentEnabled({ ...loopback, V2_PUBLIC_ORIGIN: "https://preview.example.test" }), false);
  assert.equal(isFixtureAuthEnvironmentEnabled({ ...loopback, V2_PUBLIC_ORIGIN: "http://localhost.evil.test" }), false);
  assert.equal(isFixtureAuthEnvironmentEnabled({ ...loopback, V2_PUBLIC_ORIGIN: undefined }), false);
});

test("production session cookies are Secure even when transport inference is false", () => {
  assert.equal(sessionCookieOptions(false, "development").secure, false);
  assert.equal(sessionCookieOptions(true, "development").secure, true);
  assert.equal(sessionCookieOptions(false, "production").secure, true);
  assert.equal(clearedSessionCookieOptions(false, "production").secure, true);
  assert.equal(clearedSessionCookieOptions(false, "production").maxAge, 0);
});

test("JWT decode rejects oversized attacker input before JOSE parsing", async () => {
  const codec = new JoseSessionCodec("unit-test-session-secret-with-at-least-32-bytes");
  const oversized = "a".repeat(MAXIMUM_SESSION_TOKEN_BYTES + 1);
  assert.equal(await codec.decode(oversized), null);
});
