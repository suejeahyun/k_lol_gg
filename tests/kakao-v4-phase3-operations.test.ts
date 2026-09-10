import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { KAKAO_V4_EVENT_SCOPE } from "../src/modules/recruiting/application/commands";
import { kakaoReadIdentity, type KakaoScheduledNoticeDto } from "../src/modules/recruiting/kakao-assistant/domain";
import type { OperationFormPayloadByType } from "../src/modules/recruiting/operation-forms/domain";
import { operationFormReceiptIdentity, type OperationFormMutationResult } from "../src/modules/recruiting/operation-forms/postgres-operation-forms";
import { KakaoV4CommandService } from "../src/modules/recruiting/kakao-v4/application";
import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import {
  KakaoV4CommandDispatcher,
  KakaoV4DispatcherError,
  type KakaoV4AssistantPort,
  type KakaoV4DispatchContext,
  type KakaoV4OperationFormsPort,
  type KakaoV4RecruitingPort,
} from "../src/modules/recruiting/kakao-v4/dispatcher";
import type { KakaoV4CommandEnvelope } from "../src/modules/recruiting/kakao-v4/domain";
import { kakaoV4CommandFailureResponse } from "../src/modules/recruiting/kakao-v4/http";

type CompatibilityFixture = Readonly<{
  exactReplies: Readonly<Record<string, string>>;
}>;

const fixture = JSON.parse(await readFile(
  resolve(import.meta.dirname, "fixtures/kakao-v4-v1-compatibility-contract.json"),
  "utf8",
)) as CompatibilityFixture;

const featuresEnvelope: KakaoV4CommandEnvelope = Object.freeze({
  profileId: "FEATURES",
  installationId: "install-11111111111111111111111111111111",
  senderId: "sender-user-22222222222222222222222222222222",
  eventId: "event-phase3-operations-0001",
  timestamp: 1789000000,
  nonce: "33333333333333333333333333333333",
  text: "등록",
});

const context: KakaoV4DispatchContext = Object.freeze({
  envelope: featuresEnvelope,
  keyId: "features-current",
  requestDigestHex: "ab".repeat(32),
  requestId: "request-phase3-operations-1",
  authorization: Object.freeze({
    roomId: "00000000-0000-4000-8000-000000000001",
    roomStatus: "ACTIVE",
    capabilityProfile: "FEATURES",
    installationId: "00000000-0000-4000-8000-000000000002",
  }),
});

function canonical(text: string) {
  const envelope = { ...featuresEnvelope, text };
  return canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "FEATURES", text }), envelope);
}

function harness(operationForms?: KakaoV4OperationFormsPort) {
  const staticCalls: unknown[] = [];
  const noticeCalls: unknown[] = [];
  const assistant: KakaoV4AssistantPort = {
    async getOpenChatStatus() { throw new Error("unexpected status call"); },
    async syncSeasonSnapshot() { throw new Error("unexpected season call"); },
    async recordV4StaticReply(input) {
      staticCalls.push(input);
      return { body: { kind: "KAKAO_V4_STATIC_RECEIPT", receiptVersion: 1, legacyReply: input.legacyReply }, replayed: false };
    },
    async getScheduledNotice(input) {
      noticeCalls.push(input);
      const body: KakaoScheduledNoticeDto = {
        kind: "SCHEDULED_NOTICE", slot: input.slot, seasonId: "season-1", date: "2026-09-10",
        targetCount: 10, total: 7, remaining: 3,
        positionCounts: { TOP: 2, JGL: 1, MID: 2, ADC: 1, SUP: 1 },
        shortagePositions: ["JGL", "ADC", "SUP"],
      };
      return { body, replayed: false };
    },
  };
  const recruiting: KakaoV4RecruitingPort = {
    async handle() { throw new Error("unexpected recruiting mutation"); },
    async resolveCompatTarget() { throw new Error("unexpected recruiting lookup"); },
    async resolveScrimUpsert() { throw new Error("unexpected scrim lookup"); },
  };
  return {
    dispatcher: new KakaoV4CommandDispatcher({ recruiting, assistant, ...(operationForms ? { operationForms } : {}) }),
    staticCalls,
    noticeCalls,
  };
}

test("four V1 operation forms become exact typed payloads", () => {
  const cases = [
    ["friends", "지인 이름: 친구\n지인 닉네임: Friend#KR1\n이용기간: 장기\n디스코드 닉네임 변경: 네"],
    ["suggestions", "본인 이름 및 닉네임: 홍길동/테스터\n건의 사유: 편의성\n건의 내용: 개선 바랍니다."],
    ["meetups", "주최자 이름 및 닉네임:\n일자: 2026-09-10 18시\n장소: 서울\n참여자 명단:\n1. 가\n2. 나\n3. 가"],
    ["leaves", "&lt;외출&gt;\n이름 및 닉네임: 신청자/닉\n외출기간: 2026-09-10 ~ 2026-09-12\n외출사유: 여행\n외출범위: (소통방, 구인방, 디코)"],
  ] as const;
  for (const [formType, text] of cases) {
    const command = canonical(text);
    assert.equal(command?.domain, "OPERATIONS", formType);
    assert.equal(command?.action, "SUBMIT_FORM", formType);
    if (command?.domain === "OPERATIONS" && command.action === "SUBMIT_FORM") {
      assert.equal(command.formType, formType);
    }
  }
  const friends = canonical(cases[0][1]);
  if (friends?.domain === "OPERATIONS" && friends.action === "SUBMIT_FORM" && friends.formType === "friends") {
    assert.deepEqual(friends.payload, {
      applicantName: featuresEnvelope.senderId,
      applicantNickname: featuresEnvelope.senderId,
      friendName: "친구",
      friendNickname: "Friend#KR1",
      usagePeriod: "장기",
      discordNicknameChange: true,
    });
  } else assert.fail("friends form was not canonicalized");
  const suggestion = canonical(cases[1][1]);
  if (suggestion?.domain === "OPERATIONS" && suggestion.action === "SUBMIT_FORM" && suggestion.formType === "suggestions") {
    assert.deepEqual(suggestion.payload, {
      applicantName: "홍길동",
      applicantNickname: "테스터",
      reason: "편의성",
      content: "개선 바랍니다.",
    });
  } else assert.fail("suggestion form was not canonicalized");
  const meetup = canonical(cases[2][1]);
  if (meetup?.domain === "OPERATIONS" && meetup.action === "SUBMIT_FORM" && meetup.formType === "meetups") {
    const payload = meetup.payload as OperationFormPayloadByType["meetups"];
    assert.deepEqual(payload.participants, ["가", "나"]);
    assert.equal(payload.legacyDateText, "2026-09-10 18시");
  } else assert.fail("meetup form was not canonicalized");
  const leave = canonical(cases[3][1]);
  if (leave?.domain === "OPERATIONS" && leave.action === "SUBMIT_FORM" && leave.formType === "leaves") {
    const payload = leave.payload as OperationFormPayloadByType["leaves"];
    assert.equal(payload.periodStart, "2026-09-10");
    assert.equal(payload.periodEnd, "2026-09-12");
    assert.equal(payload.scope, "소통방, 구인방, 디코");
  } else assert.fail("leave form was not canonicalized");
});

test("all four forms report their exact missing fields as INVALID_FORM commands", () => {
  const cases = [
    ["지인 이름:\n지인 닉네임:\n이용기간:\n디스코드 닉네임 변경:", ["지인 이름", "지인 닉네임", "이용기간"]],
    ["본인 이름 및 닉네임:\n건의 사유:\n건의 내용:", ["건의 사유", "건의 내용"]],
    ["주최자 이름 및 닉네임:\n일자:\n장소:\n참여자 명단:", ["일자", "장소", "참여자 명단"]],
    ["&lt;외출&gt;\n이름 및 닉네임:\n외출기간:\n외출사유:\n외출범위:", ["외출기간", "외출사유", "외출범위"]],
  ] as const;
  for (const [text, missingFields] of cases) {
    const command = canonical(text);
    assert.equal(command?.domain, "OPERATIONS");
    assert.equal(command?.action, "INVALID_FORM");
    if (command?.domain === "OPERATIONS" && command.action === "INVALID_FORM") {
      assert.deepEqual(command.missingFields, missingFields);
    }
  }
});

test("registration, result, warning, evidence, status and photo-cancel preserve V1 replies", async () => {
  const cases = [
    ["등록", "registrationHub"],
    ["사진취소", "registrationHub"],
    ["내전등록", "inhouseResultGuide"],
    ["결과현황", "inhouseResultStatusGuide"],
    ["경고등록", "disciplineCreateGuide"],
    ["인증", "disciplineEvidenceGuide"],
    ["경고현황", "disciplineStatusGuide"],
  ] as const;
  for (const [text, replyKey] of cases) {
    const state = harness();
    const command = canonical(text);
    assert.ok(command);
    const result = await state.dispatcher.dispatch({ ...context, envelope: { ...featuresEnvelope, text } }, command!);
    assert.equal(result.legacyReply, fixture.exactReplies[replyKey], text);
    assert.equal(state.staticCalls.length, 1, text);
    assert.doesNotMatch(JSON.stringify(state.staticCalls), /role|owner|allowlist/iu);
  }
});

test("scheduled notice uses one durable assistant request and preserves the V41 formatter", async () => {
  const state = harness();
  const command = canonical("자동공지 18");
  assert.deepEqual(command, { domain: "OPERATIONS", action: "SCHEDULE_NOTICE", slot: "18" });
  const result = await state.dispatcher.dispatch(context, command!);
  assert.equal(state.noticeCalls.length, 1);
  assert.equal(state.staticCalls.length, 0);
  assert.equal(result.legacyReply, [
    "[K-LOL.GG 내전 공지 미리보기]",
    "읽기 전용 미리보기이며 실제 방 자동 발송은 하지 않았습니다.",
    "날짜: 2026-09-10 · 시간: 18시",
    "활성 시즌 신청 현황",
    "신청 7/10 · 남은 인원 3명",
    "포지션: 탑 2 · 정글 1 · 미드 2 · 원딜 1 · 서포터 1",
    "부족 포지션: 정글, 원딜, 서포터",
  ].join("\n"));
});

test("valid form submits one typed mutation in the shared V4 event scope", async () => {
  const calls: Parameters<KakaoV4OperationFormsPort["submit"]>[0][] = [];
  const operationForms: KakaoV4OperationFormsPort = {
    async submit(input) {
      calls.push(input);
      return { body: { form: { formType: input.formType } }, revision: 0, replayed: false, status: 201 };
    },
  };
  const state = harness(operationForms);
  const command = canonical("본인 이름 및 닉네임: 홍길동/테스터\n건의 사유: 편의성\n건의 내용: 개선 바랍니다.");
  const result = await state.dispatcher.dispatch(context, command!);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.idempotency.eventScope, KAKAO_V4_EVENT_SCOPE);
  assert.equal(calls[0]?.idempotency.requestKey, featuresEnvelope.eventId);
  assert.equal(calls[0]?.formType, "suggestions");
  assert.equal(result.legacyReply, "[K-LOL.GG 운영 양식]\nsuggestions 양식을 접수했습니다.");
});

test("invalid form claims a durable receipt before exposing field-specific INVALID_FORM", async () => {
  const state = harness();
  const command = canonical("&lt;외출&gt;\n이름 및 닉네임: 신청자/닉\n외출기간:\n외출사유:\n외출범위:");
  await assert.rejects(
    () => state.dispatcher.dispatch(context, command!),
    (error: unknown) => error instanceof KakaoV4DispatcherError && error.code === "INVALID_FORM" && error.missingFields.join(",") === "외출기간,외출사유,외출범위",
  );
  assert.equal(state.staticCalls.length, 1);
  const response = kakaoV4CommandFailureResponse(new KakaoV4DispatcherError("INVALID_FORM", ["외출기간", "외출사유", "외출범위"]));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    type: "urn:klol:problem:invalid-form",
    title: "V1 양식 필드 누락",
    status: 400,
    detail: "필수 항목을 확인해 주세요: 외출기간, 외출사유, 외출범위",
    code: "INVALID_FORM",
  });
});

test("operation forms reuse the same durable event identity as recruiting and assistant", () => {
  const principalId = `bot:kakao:v4:${featuresEnvelope.installationId}`;
  const assistant = kakaoReadIdentity({
    principalId,
    scope: KAKAO_V4_EVENT_SCOPE,
    requestKey: featuresEnvelope.eventId,
    bodyDigestHex: context.requestDigestHex,
  });
  const operation = operationFormReceiptIdentity({
    actorPrincipalId: principalId,
    scope: KAKAO_V4_EVENT_SCOPE,
    expectedRevision: 0,
    idempotency: {
      requestKey: featuresEnvelope.eventId,
      bodyDigestHex: context.requestDigestHex,
      eventScope: KAKAO_V4_EVENT_SCOPE,
    },
  });
  assert.deepEqual(operation, assistant);
});

test("fresh service instances replay the durable form result and reject a changed body", async () => {
  const receipts = new Map<string, { digest: string; result: OperationFormMutationResult }>();
  const operationForms: KakaoV4OperationFormsPort = {
    async submit(input) {
      const current = receipts.get(input.idempotency.requestKey);
      if (current) {
        if (current.digest !== input.idempotency.bodyDigestHex) throw Object.assign(new Error("conflict"), { code: "IDEMPOTENCY_MISMATCH" });
        return { ...current.result, replayed: true };
      }
      const result: OperationFormMutationResult = { body: { form: { formType: input.formType } }, revision: 0, replayed: false, status: 201 };
      receipts.set(input.idempotency.requestKey, { digest: input.idempotency.bodyDigestHex, result });
      return result;
    },
  };
  const authorizer = {
    async authorizeProfile() { return context.authorization; },
  };
  const makeService = () => new KakaoV4CommandService(authorizer, harness(operationForms).dispatcher);
  const formText = "본인 이름 및 닉네임: 홍길동/테스터\n건의 사유: 편의성\n건의 내용: 개선 바랍니다.";
  const envelope = { ...featuresEnvelope, text: formText };
  const first = await makeService().execute(envelope, "features-current", { requestDigestHex: "ab".repeat(32), requestId: "request-first" });
  const replay = await makeService().execute(envelope, "features-current", { requestDigestHex: "ab".repeat(32), requestId: "request-replay" });
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  let conflict: unknown;
  try {
    await makeService().execute({ ...envelope, text: formText.replace("편의성", "운영") }, "features-current", { requestDigestHex: "cd".repeat(32), requestId: "request-conflict" });
  } catch (error) {
    conflict = error;
  }
  assert.ok(typeof conflict === "object" && conflict !== null && "code" in conflict && conflict.code === "IDEMPOTENCY_MISMATCH");
  const response = kakaoV4CommandFailureResponse(conflict);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "REPLAY_CONFLICT");
});

test("internal raw JSON and phone-local session commands do not become public canonical operations", () => {
  for (const text of [
    "V2양식 {\"formType\":\"leaves\"}",
    "V2사진취소",
    "내전미리보기취소",
    "내전확인 ABCD1234",
  ]) {
    assert.equal(canonical(text), null, text);
  }
  assert.equal(classifyKakaoV4Command({ profileId: "FEATURES", text: "자동공지 13" }).kind, "UNKNOWN");
});
