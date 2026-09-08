import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  recordKakaoWebhookRejection,
  verifyKakaoHttpRequest,
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
    const unavailable = await verifyKakaoHttpRequest(new Request("https://example.test/hook", { method: "POST", body: "{}" }), now);
    assert.deepEqual(unavailable, { ok: false, code: "SIGNING_KEY_UNAVAILABLE" });

    process.env.KAKAO_WEBHOOK_SECRET_CURRENT = "0123456789abcdef0123456789abcdef";
    process.env.KAKAO_WEBHOOK_KEY_ID_CURRENT = "current-contract";
    process.env.KAKAO_WEBHOOK_ALLOWED_ROOMS = "room-contract";
    process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS = "sender-contract";
    process.env.KAKAO_WEBHOOK_BOT_SENDER_ID = "sender-bot";
    const accepted = await verifyKakaoHttpRequest(signedRequest(now, '{"query":"Arcane"}'), now);
    assert.equal(accepted.ok, true);
    if (accepted.ok) assert.equal(accepted.value.intent.keyId, "current-contract");

    const query = await verifyKakaoHttpRequest(signedRequest(now, "{}", { url: "https://example.test/hook?secret=forbidden" }), now);
    assert.deepEqual(query, { ok: false, code: "QUERY_FORBIDDEN" });
    const selfHeader = await verifyKakaoHttpRequest(signedRequest(now, "{}", { "x-klol-bot-self": "yes" }), now);
    assert.deepEqual(selfHeader, { ok: false, code: "BOT_SELF_HEADER_INVALID" });

    const calls: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...values: unknown[]) => { calls.push(values); };
    try {
      recordKakaoWebhookRejection("INVALID_SIGNATURE", { route: "/hook", traceId: "trace-safe" });
    } finally {
      console.warn = originalWarn;
    }
    assert.deepEqual(calls, [["KAKAO_WEBHOOK_REJECTED", {
      code: "INVALID_SIGNATURE", route: "/hook", traceId: "trace-safe",
    }]]);
    assert.equal(JSON.stringify(calls).includes(process.env.KAKAO_WEBHOOK_SECRET_CURRENT), false);
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("legacy party and scrim mutations fail closed with an explicit V2 successor and no redirect", async () => {
  const retired = legacyKakaoRecruitTransitionResponse({ group: "party", action: "create", method: "POST" });
  assert.equal(retired.status, 410);
  assert.equal(retired.headers.get("location"), null);
  assert.equal(retired.headers.get("cache-control"), "no-store");
  assert.equal((await retired.json()).code, "KAKAO_BOT_UPGRADE_REQUIRED");

  const wrongMethod = legacyKakaoRecruitTransitionResponse({ group: "scrim", action: "create", method: "GET" });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST");

  const unknown = legacyKakaoRecruitTransitionResponse({ group: "party", action: "unknown", method: "POST" });
  assert.equal(unknown.status, 404);
});
