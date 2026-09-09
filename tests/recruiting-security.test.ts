import assert from "node:assert/strict";
import test from "node:test";

import {
  kakaoWebhookBodyDigest,
  signKakaoWebhookForFixture,
  verifyKakaoWebhook,
} from "../src/modules/recruiting";

const now = new Date("2026-09-07T00:00:00.000Z");
const currentSecret = new Uint8Array(32).fill(11);
const priorSecret = new Uint8Array(32).fill(22);
const rawBody = new TextEncoder().encode('{"command":"모집"}');

function request(secret = currentSecret) {
  const unsigned = {
    timestampSeconds: Math.floor(now.getTime() / 1_000),
    nonce: "nonce_1234567890abcdef",
    roomId: "room-1",
    senderId: "operator-1",
    rawBody,
  };
  return { ...unsigned, botSelf: false, signature: signKakaoWebhookForFixture(unsigned, secret) };
}

function verify(overrides: Partial<Parameters<typeof verifyKakaoWebhook>[0]> = {}) {
  return verifyKakaoWebhook({
    request: request(),
    now,
    secrets: [{ keyId: "current", secret: currentSecret }, { keyId: "prior", secret: priorSecret }],
    allowedRoomIds: new Set(["room-1"]),
    allowedSenderIds: new Set(["operator-1"]),
    botSenderId: "bot-1",
    nonceAlreadyUsed: false,
    ...overrides,
  });
}

test("Kakao webhook binds HMAC to timestamp, nonce, room, sender, and raw body with key rotation", () => {
  const current = verify();
  assert.equal(current.ok, true);
  if (current.ok) {
    assert.equal(current.intent.keyId, "current");
    assert.equal(current.intent.bodyDigestHex, kakaoWebhookBodyDigest(rawBody));
    assert.equal(current.intent.requireNonceClaim, true);
  }
  const priorRequest = request(priorSecret);
  const prior = verify({ request: priorRequest });
  assert.equal(prior.ok, true);
  if (prior.ok) assert.equal(prior.intent.keyId, "prior");

  const tampered = verify({ request: { ...request(), rawBody: new TextEncoder().encode('{"command":"변조"}') } });
  assert.deepEqual(tampered, { ok: false, code: "INVALID_SIGNATURE" });
});

test("Kakao webhook rejects stale/replayed, forbidden room/sender, and bot-self requests", () => {
  assert.deepEqual(verify({ now: new Date(now.getTime() + 301_000) }), { ok: false, code: "EXPIRED_TIMESTAMP" });
  assert.deepEqual(verify({ nonceAlreadyUsed: true }), { ok: false, code: "REPLAYED_NONCE" });
  assert.deepEqual(verify({ allowedRoomIds: new Set(["room-2"]) }), { ok: false, code: "ROOM_FORBIDDEN" });
  assert.deepEqual(verify({ allowedSenderIds: new Set(["operator-2"]) }), { ok: false, code: "SENDER_FORBIDDEN" });
  assert.deepEqual(verify({ request: { ...request(), botSelf: true } }), { ok: false, code: "BOT_SELF_MESSAGE" });

  const botUnsigned = { ...request(), senderId: "bot-1" };
  const unsigned = {
    timestampSeconds: botUnsigned.timestampSeconds,
    nonce: botUnsigned.nonce,
    roomId: botUnsigned.roomId,
    senderId: botUnsigned.senderId,
    rawBody: botUnsigned.rawBody,
  };
  assert.deepEqual(verify({
    request: { ...unsigned, botSelf: false, signature: signKakaoWebhookForFixture(unsigned, currentSecret) },
    allowedSenderIds: new Set(["bot-1"]),
  }), { ok: false, code: "BOT_SELF_MESSAGE" });
});

test("signed public reads may accept any human sender in an allowed room without weakening bot-self protection", () => {
  assert.equal(verify({ allowedSenderIds: new Set(), allowAnySender: true }).ok, true);
  assert.deepEqual(verify({
    allowedSenderIds: new Set(),
    allowAnySender: true,
    request: { ...request(), botSelf: true },
  }), { ok: false, code: "BOT_SELF_MESSAGE" });
  assert.deepEqual(verify({
    allowedRoomIds: new Set(["room-2"]),
    allowedSenderIds: new Set(),
    allowAnySender: true,
  }), { ok: false, code: "ROOM_FORBIDDEN" });
});

test("malformed signatures and unsafe request structure fail closed", () => {
  assert.deepEqual(verify({ request: { ...request(), signature: "bad" } }), { ok: false, code: "INVALID_SIGNATURE" });
  assert.deepEqual(verify({ request: { ...request(), nonce: "short" } }), { ok: false, code: "INVALID_REQUEST" });
  assert.deepEqual(verify({ secrets: [{ keyId: "weak", secret: new Uint8Array(8) }] }), { ok: false, code: "INVALID_REQUEST" });
  assert.deepEqual(verify({ secrets: [{ keyId: "same", secret: currentSecret }, { keyId: "same", secret: priorSecret }] }), { ok: false, code: "INVALID_REQUEST" });
});
