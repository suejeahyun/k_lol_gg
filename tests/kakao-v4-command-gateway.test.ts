import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import { KakaoV4CommandError, KakaoV4CommandService } from "../src/modules/recruiting/kakao-v4/application";
import {
  KAKAO_V4_COMMAND_CONTRACT,
  canonicalKakaoV4CommandText,
  kakaoV4SignatureMaterial,
  parseKakaoV4CommandEnvelope,
  verifyKakaoV4Signature,
  type KakaoV4CommandEnvelope,
} from "../src/modules/recruiting/kakao-v4/domain";
import { kakaoV4CommandFailureResponse, kakaoV4ProblemResponse, type KakaoV4HttpErrorCode } from "../src/modules/recruiting/kakao-v4/http";

const now = new Date("2026-09-10T03:00:00.000Z");
const envelope = Object.freeze({
  profileId: "RECRUIT",
  installationId: "install-11111111111111111111111111111111",
  senderId: "sender-user-22222222222222222222222222222222",
  eventId: "event-boot-abcdef0123456789-1",
  timestamp: Math.floor(now.getTime() / 1_000),
  nonce: "33333333333333333333333333333333",
  text: "/V4상태",
} satisfies KakaoV4CommandEnvelope);

test("V4 schema accepts only the seven identity-free envelope fields", () => {
  assert.deepEqual(parseKakaoV4CommandEnvelope(envelope), envelope);
  assert.equal(parseKakaoV4CommandEnvelope({ ...envelope, roomName: "실제 방 이름" }), null);
  assert.equal(parseKakaoV4CommandEnvelope({ ...envelope, channelId: "123" }), null);
  assert.equal(parseKakaoV4CommandEnvelope({ ...envelope, profileId: "ADMIN" }), null);
  assert.equal(parseKakaoV4CommandEnvelope({ ...envelope, senderId: "raw sender" }), null);
});

test("slash boundary preserves zero-or-one leading slash parity", () => {
  assert.equal(canonicalKakaoV4CommandText("V4상태"), "V4상태");
  assert.equal(canonicalKakaoV4CommandText("/V4상태"), "V4상태");
  for (const rejected of ["//V4상태", "/ V4상태", "오늘 /V4상태", "https://example.com/V4상태"]) {
    const canonical = canonicalKakaoV4CommandText(rejected);
    assert.notEqual(canonical, "V4상태");
  }
});

test("V4 signature covers the exact raw envelope and timestamp", () => {
  const rawBody = Buffer.from(JSON.stringify(envelope));
  const secret = Buffer.from("0123456789abcdef0123456789abcdef");
  const digest = createHash("sha256").update(rawBody).digest("hex");
  const signature = "v4=" + createHmac("sha256", secret).update(kakaoV4SignatureMaterial("current", digest)).digest("hex");
  assert.deepEqual(verifyKakaoV4Signature({ envelope, rawBody, keyId: "current", signature, secrets: [{ keyId: "current", secret }], now }), { ok: true, requestDigestHex: digest });
  assert.deepEqual(verifyKakaoV4Signature({ envelope, rawBody, keyId: "current", signature: signature.replace(/.$/u, "0"), secrets: [{ keyId: "current", secret }], now }), { ok: false, code: "SIGNATURE_INVALID" });
  assert.deepEqual(verifyKakaoV4Signature({ envelope, rawBody, keyId: "current", signature, secrets: [{ keyId: "current", secret }], now: new Date("2026-09-10T04:00:00.000Z") }), { ok: false, code: "TIMESTAMP_STALE" });
});

test("profile authorization does not receive sender role or allowlist inputs", async () => {
  const calls: unknown[] = [];
  const service = new KakaoV4CommandService({
    async authorizeProfile(input) {
      calls.push(input);
      return { roomId: "00000000-0000-4000-8000-000000000001", roomStatus: "ACTIVE", capabilityProfile: input.requiredCapabilityProfile, installationId: "00000000-0000-4000-8000-000000000002" };
    },
  });
  const result = await service.execute(envelope, "current");
  assert.equal(result.kind, "REPLY");
  assert.deepEqual(calls, [{ installationPublicId: envelope.installationId, requiredCapabilityProfile: "RECRUIT", keyId: "current" }]);
  assert.doesNotMatch(JSON.stringify(calls), /sender|role|allowlist/iu);
});

test("health and contract probes work while other commands stay explicit 501 candidates", async () => {
  const service = new KakaoV4CommandService({
    async authorizeProfile(input) {
      return { roomId: "00000000-0000-4000-8000-000000000001", roomStatus: "ACTIVE", capabilityProfile: input.requiredCapabilityProfile, installationId: "00000000-0000-4000-8000-000000000002" };
    },
  });
  const health = await service.execute(envelope, "current");
  assert.equal(health.kind, "REPLY");
  if (health.kind === "REPLY") assert.match(health.reply, new RegExp(KAKAO_V4_COMMAND_CONTRACT));
  const probe = await service.execute({ ...envelope, eventId: "event-boot-abcdef0123456789-2", text: "V4계약확인" }, "current");
  assert.equal(probe.kind, "REPLY");
  const pending = await service.execute({ ...envelope, eventId: "event-boot-abcdef0123456789-3", text: "/5인파티" }, "current");
  assert.equal(pending.kind, "NOT_IMPLEMENTED");
});

test("event ID is the idempotency boundary and mismatched reuse conflicts", async () => {
  const service = new KakaoV4CommandService({
    async authorizeProfile(input) {
      return { roomId: "00000000-0000-4000-8000-000000000001", roomStatus: "ACTIVE", capabilityProfile: input.requiredCapabilityProfile, installationId: "00000000-0000-4000-8000-000000000002" };
    },
  });
  assert.equal((await service.execute(envelope, "current")).replayed, false);
  assert.equal((await service.execute(envelope, "current")).replayed, true);
  await assert.rejects(() => service.execute({ ...envelope, text: "V4계약확인" }, "current"), (error) => error instanceof KakaoV4CommandError && error.code === "IDEMPOTENCY_MISMATCH");
});

test("public error responses keep stable status and code contracts", async () => {
  const cases: Array<[KakaoV4HttpErrorCode, number, string]> = [
    ["COMMAND_INVALID", 400, "KAKAO_V4_COMMAND_INVALID"],
    ["SIGNATURE_INVALID", 401, "INVALID_SIGNATURE"],
    ["IDEMPOTENCY_MISMATCH", 409, "IDEMPOTENCY_MISMATCH"],
    ["ROUTER_NOT_ENABLED", 501, "KAKAO_V4_COMMAND_ROUTER_NOT_ENABLED"],
    ["UNAVAILABLE", 503, "KAKAO_V4_UNAVAILABLE"],
  ];
  for (const [code, status, publicCode] of cases) {
    const response = kakaoV4ProblemResponse(code, "trace-v4-test");
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, publicCode);
  }
});

test("V4 application errors normalize idempotency conflicts to public 409 only", async () => {
  const conflict = kakaoV4CommandFailureResponse(new KakaoV4CommandError("IDEMPOTENCY_MISMATCH"), "trace-v4-conflict");
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, "IDEMPOTENCY_MISMATCH");

  const unavailable = kakaoV4CommandFailureResponse(new KakaoV4CommandError("DISPATCHER_UNAVAILABLE"), "trace-v4-unavailable");
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, "KAKAO_V4_UNAVAILABLE");

  const invalid = kakaoV4CommandFailureResponse({ code: "INVALID_COMMAND" }, "trace-v4-invalid");
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, "KAKAO_V4_COMMAND_INVALID");
});
