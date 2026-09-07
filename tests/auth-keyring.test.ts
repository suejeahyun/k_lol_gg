import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { decryptTotpSecret, encryptTotpSecret } from "../src/modules/auth/infrastructure/totp-envelope";
import { JoseSessionCodec } from "../src/modules/auth/infrastructure/jose-session-codec";
import {
  parseDatabaseAuthRuntimeSecrets,
  parseRateLimitPepper,
  parseSessionSigningKeyring,
  parseTotpEncryptionKeyring,
} from "../src/modules/auth/infrastructure/versioned-secret-keyring";

function encodedKey() {
  return randomBytes(32).toString("base64url");
}

test("versioned keyrings require explicit current 32-byte keys", () => {
  const signingKey = encodedKey();
  const totpKey = encodedKey();
  const signing = parseSessionSigningKeyring(JSON.stringify({
    current: "2026-09",
    keys: { "2026-09": signingKey },
  }));
  const totp = parseTotpEncryptionKeyring(JSON.stringify({
    current: 7,
    keys: { 7: totpKey },
  }));

  assert.equal(signing.currentKeyId, "2026-09");
  assert.equal(signing.keys.get("2026-09")?.byteLength, 32);
  assert.equal(totp.currentKeyVersion, 7);
  assert.equal(totp.keys.get(7)?.byteLength, 32);
  assert.equal(parseRateLimitPepper(encodedKey()).byteLength, 32);

  assert.throws(() => parseSessionSigningKeyring(undefined), /SESSION_SIGNING_KEYS/);
  assert.throws(
    () => parseSessionSigningKeyring(JSON.stringify({ current: "missing", keys: { other: signingKey } })),
    /current/,
  );
  assert.throws(() => parseTotpEncryptionKeyring(JSON.stringify({ current: 1, keys: { 1: "short" } })), /invalid key/);
  assert.throws(() => parseRateLimitPepper("not-a-key"), /invalid key/);
});

test("database authentication fails closed when any required runtime value is missing", () => {
  const complete = {
    DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/klol_v2_test_runtime",
    SESSION_SIGNING_KEYS: JSON.stringify({ current: "v1", keys: { v1: encodedKey() } }),
    TOTP_ENCRYPTION_KEYS: JSON.stringify({ current: 1, keys: { 1: encodedKey() } }),
    V2_AUTH_RATE_LIMIT_PEPPER: encodedKey(),
  };
  assert.equal(parseDatabaseAuthRuntimeSecrets(complete).rateLimitPepper.byteLength, 32);

  for (const missing of Object.keys(complete) as Array<keyof typeof complete>) {
    const incomplete = { ...complete, [missing]: undefined };
    assert.throws(() => parseDatabaseAuthRuntimeSecrets(incomplete));
  }
  assert.throws(() => parseDatabaseAuthRuntimeSecrets({
    ...complete,
    DATABASE_URL: "https://database.invalid/not-postgres",
  }), /PostgreSQL protocol/);
});

test("AES-256-GCM TOTP envelope binds ciphertext to account and key version", () => {
  const accountId = randomUUID();
  const keyring = parseTotpEncryptionKeyring(JSON.stringify({
    current: 3,
    keys: { 3: encodedKey() },
  }));
  const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  const encrypted = encryptTotpSecret(accountId, secret, keyring);
  const credential = {
    userAccountId: accountId,
    ...encrypted,
    enabledAt: new Date(),
    lastUsedStep: null,
  };
  const tamperedCiphertext = Buffer.from(credential.secretCiphertext);
  tamperedCiphertext[0] ^= 0xff;

  assert.equal(decryptTotpSecret(credential, keyring), secret);
  assert.throws(
    () => decryptTotpSecret({ ...credential, userAccountId: randomUUID() }, keyring),
    /could not be decrypted/,
  );
  assert.throws(
    () => decryptTotpSecret({
      ...credential,
      secretCiphertext: tamperedCiphertext,
    }, keyring),
    /could not be decrypted/,
  );
});

test("session signing keyring writes current kid and still verifies retained prior keys", async () => {
  const oldKey = encodedKey();
  const newKey = encodedKey();
  const oldCodec = new JoseSessionCodec(parseSessionSigningKeyring(JSON.stringify({
    current: "old",
    keys: { old: oldKey },
  })));
  const token = await oldCodec.encode({
    userId: "rotation-admin",
    role: "ADMIN",
    purpose: "ADMIN",
    accountStatus: "APPROVED",
    mustChangePassword: false,
    authVersion: 2,
    adminTotpVerified: true,
    source: "database",
  });
  const rotatedCodec = new JoseSessionCodec(parseSessionSigningKeyring(JSON.stringify({
    current: "new",
    keys: { old: oldKey, new: newKey },
  })));

  assert.equal((await rotatedCodec.decode(token))?.userId, "rotation-admin");
});
