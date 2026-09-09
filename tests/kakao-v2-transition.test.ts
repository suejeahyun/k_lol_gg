import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  recordKakaoWebhookRejection,
  verifyKakaoInstallationHttpRequest,
} from "../src/modules/recruiting/infrastructure/kakao-http-request";
import { kakaoWebhookBodyDigest } from "../src/modules/recruiting/infrastructure/kakao-signature";
import { legacyKakaoRecruitTransitionResponse } from "../src/modules/recruiting/infrastructure/legacy-kakao-recruit-transition";

const ENV_KEYS = [
  "KAKAO_WEBHOOK_SECRET_CURRENT",
  "KAKAO_WEBHOOK_KEY_ID_CURRENT",
  "KAKAO_WEBHOOK_SECRET_PREVIOUS",
  "KAKAO_WEBHOOK_KEY_ID_PREVIOUS",
  "KAKAO_WEBHOOK_ALLOWED_ROOMS",
  "KAKAO_WEBHOOK_ALLOWED_SENDERS",
  "KAKAO_WEBHOOK_BOT_SENDER_ID",
] as const;

function signedRequest(now: Date, body: string, overrides: Readonly<Record<string, string>> = {}) {
  const timestamp = String(Math.floor(now.getTime() / 1_000));
  const nonce = "nonce-contract-00000001";
  const roomId = "room-contract";
  const senderId = "sender-contract";
  const digest = kakaoWebhookBodyDigest(new TextEncoder().encode(body));
  const material = ["KLOL_KAKAO_WEBHOOK_V1", timestamp, nonce, roomId, senderId, digest].join("\n");
  const signature = `v1=${createHmac("sha256", process.env.KAKAO_WEBHOOK_SECRET_CURRENT!).update(material).digest("hex")}`;
  return new Request(overrides.url ?? "https://example.test/api/integrations/kakao/search-player", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-klol-timestamp": timestamp,
      "x-klol-nonce": nonce,
      "x-klol-room": roomId,
      "x-klol-sender": senderId,
      "x-klol-bot-self": "0",
      "x-klol-signature": signature,
      ...overrides,
    },
    body,
  });
}

test("Kakao HTTP verification reports allowlisted internal reasons without weakening the generic boundary", { concurrency: false }, async () => {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const now = new Date("2026-09-08T00:00:00.000Z");
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    const unavailable = await verifyKakaoInstallationHttpRequest(new Request("https://example.test/hook", { method: "POST", body: "{}" }), now);
    assert.deepEqual(unavailable, { ok: false, code: "SIGNING_KEY_UNAVAILABLE" });

    process.env.KAKAO_WEBHOOK_SECRET_CURRENT = "0123456789abcdef0123456789abcdef";
    process.env.KAKAO_WEBHOOK_KEY_ID_CURRENT = "current-contract";
    process.env.KAKAO_WEBHOOK_ALLOWED_ROOMS = "room-contract";
    process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS = "sender-contract";
    process.env.KAKAO_WEBHOOK_BOT_SENDER_ID = "sender-bot";
    const accepted = await verifyKakaoInstallationHttpRequest(signedRequest(now, '{"query":"Arcane"}'), now);
    assert.equal(accepted.ok, true);
    if (accepted.ok) assert.equal(accepted.value.intent.keyId, "current-contract");

    const query = await verifyKakaoInstallationHttpRequest(signedRequest(now, "{}", { url: "https://example.test/hook?secret=forbidden" }), now);
    assert.deepEqual(query, { ok: false, code: "QUERY_FORBIDDEN" });
    const selfHeader = await verifyKakaoInstallationHttpRequest(signedRequest(now, "{}", { "x-klol-bot-self": "yes" }), now);
    assert.deepEqual(selfHeader, { ok: false, code: "BOT_SELF_HEADER_INVALID" });

    const calls: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...values: unknown[]) => { calls.push(values); };
    try {
      recordKakaoWebhookRejection("INVALID_SIGNATURE", { route: "/hook", traceId: "trace-safe" });
      recordKakaoWebhookRejection("ROOM_FORBIDDEN", { route: "/hook" });
      recordKakaoWebhookRejection("BOT_SELF_MESSAGE", { route: "/hook" });
      recordKakaoWebhookRejection("CAPABILITY_FORBIDDEN", { route: "/hook" });
      recordKakaoWebhookRejection("INVALID_SIGNATURE", { route: "/hook", request: signedRequest(now, "{}", { "x-klol-installation": `install-${"a".repeat(32)}` }) });
    } finally {
      console.warn = originalWarn;
    }
    assert.deepEqual(calls.map((call) => (call[1] as { stage: string }).stage), ["SIGNATURE", "ROOM", "SENDER", "CAPABILITY", "SIGNATURE"]);
    assert.deepEqual(calls[0], ["KAKAO_WEBHOOK_REJECTED", {
      code: "INVALID_SIGNATURE", stage: "SIGNATURE", route: "/hook", traceId: "trace-safe",
      installationHint: null, signatureHint: null,
    }]);
    assert.equal(JSON.stringify(calls).includes(process.env.KAKAO_WEBHOOK_SECRET_CURRENT), false);
    assert.equal(JSON.stringify(calls).includes("room-contract"), false);
    assert.equal(JSON.stringify(calls).includes("sender-contract"), false);
    const keyedLog = calls[4]?.[1] as { installationHint: string; signatureHint: string };
    assert.match(keyedLog.installationHint, /^[a-f0-9]{12}$/u);
    assert.match(keyedLog.signatureHint, /^[a-f0-9]{12}$/u);
    assert.equal(JSON.stringify(keyedLog).includes(`install-${"a".repeat(32)}`), false);
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("V2 installation fingerprint is inside the HMAC material", { concurrency: false }, async () => {
  const prior = process.env.KAKAO_WEBHOOK_SECRET_CURRENT; const priorBot = process.env.KAKAO_WEBHOOK_BOT_SENDER_ID; const now = new Date("2026-09-09T07:40:00.000Z");
  process.env.KAKAO_WEBHOOK_SECRET_CURRENT = "0123456789abcdef0123456789abcdef";
  process.env.KAKAO_WEBHOOK_BOT_SENDER_ID = `sender-${"e".repeat(32)}`;
  try {
    const body = "{}"; const timestamp = String(Math.floor(now.getTime() / 1_000)); const nonce = "nonce-installation-000001";
    const installationId = `install-${"a".repeat(32)}`; const roomId = `room-${"b".repeat(32)}`; const senderId = `sender-${"c".repeat(32)}`;
    const digest = kakaoWebhookBodyDigest(new TextEncoder().encode(body));
    const material = ["KLOL_KAKAO_WEBHOOK_V2", timestamp, nonce, installationId, roomId, senderId, digest].join("\n");
    const signature = `v2=${createHmac("sha256", process.env.KAKAO_WEBHOOK_SECRET_CURRENT).update(material).digest("hex")}`;
    const request = (install: string) => new Request("https://example.test/hook", { method: "POST", headers: { "x-klol-timestamp": timestamp, "x-klol-nonce": nonce, "x-klol-installation": install, "x-klol-room": roomId, "x-klol-sender": senderId, "x-klol-bot-self": "0", "x-klol-signature": signature }, body });
    const accepted = await verifyKakaoInstallationHttpRequest(request(installationId), now); assert.equal(accepted.ok, true); if (accepted.ok) assert.equal(accepted.value.intent.installationId, installationId);
    assert.deepEqual(await verifyKakaoInstallationHttpRequest(request(`install-${"d".repeat(32)}`), now), { ok: false, code: "INVALID_SIGNATURE" });
  } finally { if (prior === undefined) delete process.env.KAKAO_WEBHOOK_SECRET_CURRENT; else process.env.KAKAO_WEBHOOK_SECRET_CURRENT = prior; if (priorBot === undefined) delete process.env.KAKAO_WEBHOOK_BOT_SENDER_ID; else process.env.KAKAO_WEBHOOK_BOT_SENDER_ID = priorBot; }
});

test("V3 binds installation key id, delivery id, and bot version inside the HMAC material", { concurrency: false }, async () => {
  const prior = process.env.KAKAO_WEBHOOK_SECRET_CURRENT; const priorKey = process.env.KAKAO_WEBHOOK_KEY_ID_CURRENT; const priorBot = process.env.KAKAO_WEBHOOK_BOT_SENDER_ID; const now = new Date("2026-09-09T09:53:46.000Z");
  process.env.KAKAO_WEBHOOK_SECRET_CURRENT = "0123456789abcdef0123456789abcdef";
  process.env.KAKAO_WEBHOOK_KEY_ID_CURRENT = "phone-key-a";
  process.env.KAKAO_WEBHOOK_BOT_SENDER_ID = `sender-${"e".repeat(32)}`;
  try {
    const body = "{}"; const timestamp = String(Math.floor(now.getTime() / 1_000)); const nonce = "nonce-v3-installation-0001";
    const installationId = `install-${"a".repeat(32)}`; const keyId = "phone-key-a"; const deliveryId = `delivery-${"b".repeat(32)}`; const botVersion = "KLOL_V41_V3_R14"; const roomId = `room-${"c".repeat(32)}`; const senderId = `sender-${"d".repeat(32)}`;
    const digest = kakaoWebhookBodyDigest(new TextEncoder().encode(body));
    const material = ["KLOL_KAKAO_WEBHOOK_V3", timestamp, nonce, installationId, keyId, deliveryId, botVersion, roomId, senderId, digest].join("\n");
    const signature = `v3=${createHmac("sha256", process.env.KAKAO_WEBHOOK_SECRET_CURRENT).update(material).digest("hex")}`;
    const request = (overrides: Record<string, string> = {}) => new Request("https://example.test/hook", { method: "POST", headers: { "x-klol-timestamp": timestamp, "x-klol-nonce": nonce, "x-klol-installation": installationId, "x-klol-key-id": keyId, "x-klol-delivery": deliveryId, "x-klol-bot-version": botVersion, "x-klol-room": roomId, "x-klol-sender": senderId, "x-klol-bot-self": "0", "x-klol-signature": signature, ...overrides }, body });
    const accepted = await verifyKakaoInstallationHttpRequest(request(), now); assert.equal(accepted.ok, true);
    if (accepted.ok) { assert.equal(accepted.value.intent.keyId, keyId); assert.equal(accepted.value.intent.deliveryId, deliveryId); assert.equal(accepted.value.intent.botVersion, botVersion); }
    assert.deepEqual(await verifyKakaoInstallationHttpRequest(request({ "x-klol-key-id": "phone-key-b" }), now), { ok: false, code: "INVALID_SIGNATURE" });
    assert.deepEqual(await verifyKakaoInstallationHttpRequest(request({ "x-klol-delivery": `delivery-${"f".repeat(32)}` }), now), { ok: false, code: "INVALID_SIGNATURE" });
  } finally {
    if (prior === undefined) delete process.env.KAKAO_WEBHOOK_SECRET_CURRENT; else process.env.KAKAO_WEBHOOK_SECRET_CURRENT = prior;
    if (priorKey === undefined) delete process.env.KAKAO_WEBHOOK_KEY_ID_CURRENT; else process.env.KAKAO_WEBHOOK_KEY_ID_CURRENT = priorKey;
    if (priorBot === undefined) delete process.env.KAKAO_WEBHOOK_BOT_SENDER_ID; else process.env.KAKAO_WEBHOOK_BOT_SENDER_ID = priorBot;
  }
});

test("legacy party and scrim mutations fail closed with an explicit V2 successor and no redirect", async () => {
  const retired = legacyKakaoRecruitTransitionResponse({ group: "party", action: "create", method: "POST" });
  assert.equal(retired.status, 410);
  assert.equal(retired.headers.get("location"), null);
  assert.equal(retired.headers.get("cache-control"), "no-store");
  assert.equal((await retired.json()).code, "KAKAO_BOT_UPGRADE_REQUIRED");

  const dailyClose = legacyKakaoRecruitTransitionResponse({ group: "party", action: "auto-finish-idle", method: "POST" });
  const dailyCloseBody = await dailyClose.json();
  assert.equal(dailyClose.status, 410);
  assert.equal(dailyCloseBody.successor, "/api/internal/jobs/kakao-daily-close");
  assert.match(dailyClose.headers.get("link") ?? "", /\/api\/internal\/jobs\/kakao-daily-close/);

  const wrongMethod = legacyKakaoRecruitTransitionResponse({ group: "scrim", action: "create", method: "GET" });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST");

  const unknown = legacyKakaoRecruitTransitionResponse({ group: "party", action: "unknown", method: "POST" });
  assert.equal(unknown.status, 404);
});
