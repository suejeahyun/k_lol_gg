import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import { KAKAO_V4_SCRIM_RETIRED_REPLY, KakaoV4CommandError, KakaoV4CommandService } from "../src/modules/recruiting/kakao-v4/application";
import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import type { KakaoV4CommandDispatcher } from "../src/modules/recruiting/kakao-v4/dispatcher";
import {
  KAKAO_V4_COMMAND_CONTRACT,
  KAKAO_V1_STRICT_PROTOCOL,
  KAKAO_V1_STRICT_RESPONSE_FORMAT,
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

test("V4 schema preserves the seven-field client and accepts only the exact V1 strict extension", () => {
  assert.deepEqual(parseKakaoV4CommandEnvelope(envelope), envelope);
  const v1Strict = {
    ...envelope,
    protocol: KAKAO_V1_STRICT_PROTOCOL,
    responseFormat: KAKAO_V1_STRICT_RESPONSE_FORMAT,
  } as const;
  assert.deepEqual(parseKakaoV4CommandEnvelope(v1Strict), v1Strict);
  assert.equal(parseKakaoV4CommandEnvelope({ ...envelope, protocol: KAKAO_V1_STRICT_PROTOCOL }), null);
  assert.equal(parseKakaoV4CommandEnvelope({ ...v1Strict, responseFormat: "V4_DEFAULT" }), null);
  assert.equal(parseKakaoV4CommandEnvelope({ ...envelope, roomName: "실제 방 이름" }), null);
  assert.equal(parseKakaoV4CommandEnvelope({ ...envelope, channelId: "123" }), null);
  assert.equal(parseKakaoV4CommandEnvelope({ ...envelope, profileId: "ADMIN" }), null);
  assert.equal(parseKakaoV4CommandEnvelope({ ...envelope, senderId: "raw sender" }), null);
});

test("slash boundary preserves zero-or-one leading slash parity", () => {
  assert.equal(canonicalKakaoV4CommandText("V4상태"), "V4상태");
  assert.equal(canonicalKakaoV4CommandText("/V4상태"), "V4상태");
  assert.equal(canonicalKakaoV4CommandText("／１５ㅉ"), "15ㅉ");
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

  const fullwidthEnvelope = { ...envelope, text: "／１５ㅉ" };
  const fullwidthRawBody = Buffer.from(JSON.stringify(fullwidthEnvelope));
  const fullwidthDigest = createHash("sha256").update(fullwidthRawBody).digest("hex");
  const fullwidthSignature = "v4=" + createHmac("sha256", secret).update(kakaoV4SignatureMaterial("current", fullwidthDigest)).digest("hex");
  assert.deepEqual(
    verifyKakaoV4Signature({ envelope: fullwidthEnvelope, rawBody: fullwidthRawBody, keyId: "current", signature: fullwidthSignature, secrets: [{ keyId: "current", secret }], now }),
    { ok: true, requestDigestHex: fullwidthDigest },
  );
  assert.notEqual(fullwidthDigest, createHash("sha256").update(Buffer.from(JSON.stringify({ ...fullwidthEnvelope, text: "15ㅉ" }))).digest("hex"));
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
  assert.deepEqual(calls, [{ installationPublicId: envelope.installationId, requiredCapabilityProfile: "RECRUIT" }]);
  assert.doesNotMatch(JSON.stringify(calls), /sender|role|allowlist/iu);
});

test("health, contract probes, and classified commands return deterministic replies without a runtime dispatcher", async () => {
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
  assert.equal(pending.kind, "REPLY");
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

test("hot replay cache binds the verified raw request digest", async () => {
  const service = new KakaoV4CommandService({
    async authorizeProfile(input) {
      return { roomId: "00000000-0000-4000-8000-000000000001", roomStatus: "ACTIVE", capabilityProfile: input.requiredCapabilityProfile, installationId: "00000000-0000-4000-8000-000000000002" };
    },
  });
  const metadata = { requestDigestHex: "a".repeat(64), requestId: "request-v4-raw-digest" };
  assert.equal((await service.execute(envelope, "current", metadata)).replayed, false);
  assert.equal((await service.execute(envelope, "current", metadata)).replayed, true);
  await assert.rejects(
    () => service.execute(envelope, "current", { ...metadata, requestDigestHex: "b".repeat(64) }),
    (error) => error instanceof KakaoV4CommandError && error.code === "IDEMPOTENCY_MISMATCH",
  );
});

test("R23 retires every old-phone scrim command and form without dispatching or writing", async () => {
  let dispatches = 0;
  const service = new KakaoV4CommandService({
    async authorizeProfile(input) {
      return { roomId: "00000000-0000-4000-8000-000000000001", roomStatus: "ACTIVE", capabilityProfile: input.requiredCapabilityProfile, installationId: "00000000-0000-4000-8000-000000000002" };
    },
  }, {
    async dispatch() {
      dispatches += 1;
      throw new Error("Retired scrim input reached a mutation-capable dispatcher");
    },
  } as unknown as KakaoV4CommandDispatcher);
  const inputs = [
    "스크림구인", "스크림모집", "멸망전스크림", "멸망전 스크림 모집", "스크림현황", "멸망전스크림목록",
    "스크림상세 1", "스크림상세 1 추가 지후", "스크림상세 1 삭제 지후", "스크림 1ㅉ",
    "스크림참가 1 지후", "스크림확정 1", "스크림취소 1", "스크림마감 1", "스크림종료 1",
    "[K-LOL.GG 스크림 구인 양식]\n운영일: 2026-09-20\n번호: #1\n우리팀: A\n상대팀: B\nTOP. 지후",
    "[K-LOL.GG 멸망전 스크림 상세]\n우리팀: A\n상대팀: B",
    "[KLOL.GG스크림구인양식]\n우리팀: A\n상대팀: B",
  ];
  for (const [index, text] of inputs.entries()) {
    for (const prefix of ["", "/"]) {
      const request = { ...envelope, eventId: `event-scrim-r23-${index}-${prefix ? 1 : 0}`, text: `${prefix}${text}` };
      const result = await service.execute(request, "current");
      assert.equal(result.reply, KAKAO_V4_SCRIM_RETIRED_REPLY, request.text);
      assert.equal((await service.execute(request, "current")).replayed, true);
      const classification = classifyKakaoV4Command(request);
      const command = canonicalizeKakaoV4Command(classification, request);
      if (command) {
        assert.equal(command.domain, "SCRIM");
        const canonicalResult = await service.executeCanonical({ envelope: request, keyId: "current", requestDigestHex: "a".repeat(64), requestId: request.eventId, command });
        assert.equal(canonicalResult.legacyReply, KAKAO_V4_SCRIM_RETIRED_REPLY);
      }
    }
  }
  assert.equal(dispatches, 0);
});

test("R24 server help separates adding a name from initial party settings and inhouse mode choice", async () => {
  const service = new KakaoV4CommandService({
    async authorizeProfile(input) {
      return { roomId: "00000000-0000-4000-8000-000000000001", roomStatus: "ACTIVE", capabilityProfile: input.requiredCapabilityProfile, installationId: "00000000-0000-4000-8000-000000000002" };
    },
  });
  for (const text of ["도움말", "구인도움말"]) {
    const result = await service.execute({ ...envelope, text, eventId: `event-r24-help-${text}` }, "current");
    assert.match(result.reply, /최근 봇 명단 전체 복사/u);
    assert.match(result.reply, /빈칸에 내 이름 입력/u);
    assert.match(result.reply, /메시지 전체 전송 = 저장/u);
    assert.match(result.reply, /사이트에 등록한 이름/u);
    assert.match(result.reply, /내전구인 협곡/u);
    assert.match(result.reply, /처음 파티를 만들 때만 첫 전송 전에 시간·게임/u);
    assert.ok(result.reply.indexOf("최근 봇 명단 전체 복사") < result.reply.indexOf("새 모집 만들기"));
    assert.doesNotMatch(result.reply, /1\. 5인파티|저장기준/u);
    assert.doesNotMatch(result.reply, /스크림/u);
    if (text === "구인도움말") assert.match(result.reply, /참가가 시작된 파티는 복붙으로 시간·게임을 바꿀 수 없어요/u);
  }
  const retired = await service.execute({ ...envelope, profileId: "FEATURES", text: "내전확인 ABCDEF", eventId: "event-r24-retired-confirm-guide" }, "current");
  assert.match(retired.reply, /빈칸에 사이트 등록 이름 추가/u);
  assert.match(retired.reply, /기존 이름과 양식코드는 그대로/u);
  assert.match(retired.reply, /변경된 내용은 없습니다/u);
  assert.doesNotMatch(retired.reply, /최종 명단으로 즉시 반영|전체 양식을 수정/u);
});

test("public error responses keep stable status and code contracts", async () => {
  const cases: Array<[KakaoV4HttpErrorCode, number, string]> = [
    ["COMMAND_INVALID", 400, "KAKAO_V4_COMMAND_INVALID"],
    ["SIGNATURE_INVALID", 401, "INVALID_SIGNATURE"],
    ["IDEMPOTENCY_MISMATCH", 409, "REPLAY_CONFLICT"],
    ["INVALID_FORM", 400, "INVALID_FORM"],
    ["UNAVAILABLE", 503, "SERVER_UNAVAILABLE"],
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
  assert.equal((await conflict.json()).code, "REPLAY_CONFLICT");

  const unavailable = kakaoV4CommandFailureResponse(new KakaoV4CommandError("DISPATCHER_UNAVAILABLE"), "trace-v4-unavailable");
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, "SERVER_UNAVAILABLE");

  const invalid = kakaoV4CommandFailureResponse({ code: "INVALID_COMMAND" }, "trace-v4-invalid");
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, "INVALID_FORM");
});
