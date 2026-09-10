import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { KakaoV4CommandError, KakaoV4CommandService } from "../src/modules/recruiting/kakao-v4/application";
import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import type { KakaoV4CommandDispatcher } from "../src/modules/recruiting/kakao-v4/dispatcher";
import type { KakaoV4CommandEnvelope, KakaoV4ProfileId } from "../src/modules/recruiting/kakao-v4/domain";
import { kakaoV4CommandFailureResponse, kakaoV4ProblemResponse } from "../src/modules/recruiting/kakao-v4/http";

type V1Contract = Readonly<{
  inhouse: Readonly<{
    modeSelectorReply: string;
    riftTemplate: string;
    aramTemplate: string;
    multiRoundStatusReply: string;
  }>;
  scrim: Readonly<{
    initialTemplate: string;
    newFormReply: string;
  }>;
  operationForms: Readonly<{ missingFieldsReply: string }>;
  exactReplies: Readonly<Record<string, string>>;
}>;

const fixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "fixtures/kakao-v4-v1-compatibility-contract.json"), "utf8"),
) as V1Contract;

const NOW_SECONDS = Math.floor(new Date("2026-09-09T12:30:00.000Z").getTime() / 1_000);
const ROOM_ID = "00000000-0000-4000-8000-000000000001";
const OPERATION_SUCCESS_REPLY = "[K-LOL.GG 운영 양식]\nV1 서버가 만든 접수 응답";
const NOTICE_REPLY = [
  "[K-LOL.GG 내전 공지 미리보기]",
  "읽기 전용 미리보기이며 실제 방 자동 발송은 하지 않았습니다.",
  "날짜: 2026-09-10 · 시간: 20시",
  "활성 시즌 신청 현황",
  "신청 7/10 · 남은 인원 3명",
  "포지션: 탑 2 · 정글 1 · 미드 2 · 원딜 1 · 서포터 1",
  "부족 포지션: 정글, 원딜, 서포터",
].join("\n");

function envelope(profileId: KakaoV4ProfileId, text: string, event = 1, sender = "a"): KakaoV4CommandEnvelope {
  return Object.freeze({
    profileId,
    installationId: `install-${profileId === "FEATURES" ? "2".repeat(32) : "1".repeat(32)}`,
    senderId: `sender-user-${sender.repeat(32).slice(0, 32)}`,
    eventId: `event-phase3-${String(event).padStart(8, "0")}`,
    timestamp: NOW_SECONDS,
    nonce: String(event).padStart(32, "0"),
    text,
  });
}

function object(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function valuesFromCanonicalSnapshot(value: unknown) {
  const canonical = object(value);
  const payload = object(canonical.payload ?? canonical);
  const rows = payload.participants ?? payload.members;
  assert.ok(Array.isArray(rows), "canonical snapshot must expose the complete participants/members array");
  return rows.map((row) => String(object(row).name));
}

function inhouseTemplate(mode: "협곡" | "칼바람" | "증바람", members: readonly string[]) {
  const lines = [
    "📢 내전하실분 #2",
    ` 》${mode}`,
    " 》2026-09-09 21:30 시작",
    `👥 ${members.length}/10명`,
    "",
    "*참가 신청 양식*",
    mode === "협곡" ? "이름/현티어/최고티어/주라인/부라인" : "이름",
    mode === "협곡" ? "EX) 1.지후/P/E/AD/MD" : "EX) 1.지후",
    "",
  ];
  for (let index = 0; index < 10; index += 1) lines.push(`${index + 1}.${members[index] ? ` ${members[index]}` : ""}`);
  return lines.join("\n");
}

const SCRIM_NEW_FORM = fixture.scrim.initialTemplate
  .replace("번호: #자동배정", "번호: #7")
  .replace("일시: ", "일시: 9/9 21:00")
  .replace("우리팀: ", "우리팀: 하늘단")
  .replace("상대팀: ", "상대팀: 꽃잎단");
const SCRIM_EDIT_FORM = SCRIM_NEW_FORM.replace("SUP: ", "SUP: 새하늘서폿");
const SCRIM_EDIT_REPLY = [
  "[스크림 #7 반영]",
  "상태: 매칭완료",
  "",
  "운영일: 2026-09-09",
  "번호: #7",
  "일시: 9/9 21:00",
  "방식: 3판2선",
  "",
  "우리팀: 하늘단",
  "TOP: ",
  "JUG: ",
  "MID: ",
  "ADC: ",
  "SUP: 새하늘서폿",
  "",
  "상대팀: 꽃잎단",
  "TOP: ",
  "JUG: ",
  "MID: ",
  "ADC: ",
  "SUP: ",
].join("\n");

type HarnessOptions = Readonly<{
  replies?: Readonly<Record<string, string>>;
  invalidTexts?: ReadonlySet<string>;
}>;

function harness(options: HarnessOptions = {}) {
  const authorizations: unknown[] = [];
  const dispatches: Array<Readonly<{ text: string; canonical: unknown }>> = [];
  const dispatcher = {
    async dispatch(context: Readonly<{ envelope: KakaoV4CommandEnvelope }>, canonical: unknown) {
      dispatches.push(Object.freeze({ text: context.envelope.text, canonical }));
      if (options.invalidTexts?.has(context.envelope.text)) throw new KakaoV4CommandError("INVALID_FORM");
      return Object.freeze({
        kind: "SEASON",
        action: String(object(canonical).action ?? "STATUS"),
        aggregate: null,
        legacyReply: options.replies?.[context.envelope.text] ?? "[K-LOL.GG Phase 3 QA] server legacyReply",
        replayed: false,
      });
    },
  } as unknown as KakaoV4CommandDispatcher;
  const service = new KakaoV4CommandService({
    async authorizeProfile(input) {
      authorizations.push(input);
      return {
        roomId: ROOM_ID,
        roomStatus: "ACTIVE",
        capabilityProfile: input.requiredCapabilityProfile,
        installationId: "00000000-0000-4000-8000-000000000002",
      };
    },
  }, dispatcher);
  return { service, authorizations, dispatches };
}

async function expectExactReply(profile: KakaoV4ProfileId, text: string, expected: string, event: number) {
  const qa = harness({ replies: { [text]: expected } });
  const result = await qa.service.execute(envelope(profile, text, event), "current");
  assert.equal(result.kind, "REPLY", `${text}: intentional 501 remains until Phase 3 is implemented`);
  if (result.kind === "REPLY") assert.equal(result.reply, expected);
}

const INHOUSE_REPLY_CASES = [
  ["내전구인", fixture.inhouse.modeSelectorReply],
  ["내전구인 협곡 2026-09-09 21:30 #2 10명", fixture.inhouse.riftTemplate],
  ["내전구인 칼바람 2026-09-09 21:30 #3 10명", fixture.inhouse.aramTemplate],
  ["내전구인 증바람 2026-09-09 21:30 #3 10명", fixture.inhouse.aramTemplate.replace("칼바람", "증바람")],
  ["내전현황", fixture.inhouse.multiRoundStatusReply],
  ["내전상세 2", inhouseTemplate("협곡", ["재현/P/E/AD/MD", "민서/D/M/MD/SUP"])],
] as const;

for (const [index, [command, expected]] of INHOUSE_REPLY_CASES.entries()) {
  test(`[P3-I${String(index + 1).padStart(2, "0")}] FEATURES INHOUSE ${command} keeps exact V1 reply parity`, async () => {
    await expectExactReply("FEATURES", command, expected, 100 + index);
  });
}

test("[P3-I07] INHOUSE authoritative snapshots preserve delete, zero and A→B→A revisions", () => {
  const revisions = [
    ["재현/P/E/AD/MD", "기용/D/M/TOP/JUG"],
    ["재현/P/E/AD/MD", "소영/E/M/SUP/ADC"],
    ["재현/P/E/AD/MD", "기용/D/M/TOP/JUG"],
    [],
  ] as const;
  const actual = revisions.map((members, index) => {
    const message = inhouseTemplate("협곡", members);
    const classified = classifyKakaoV4Command({ profileId: "FEATURES", text: message });
    const canonical = canonicalizeKakaoV4Command(classified, envelope("FEATURES", message, 120 + index));
    assert.ok(canonical, `revision ${index + 1}: intentional 501 remains until the snapshot is canonicalized`);
    assert.equal(object(canonical).action, "SYNC");
    return valuesFromCanonicalSnapshot(canonical);
  });
  assert.deepEqual(actual, revisions.map((members) => members.map((member) => member.split("/")[0])));
});

test("[P3-I08] ARAM and AUGMENT_ARAM snapshots keep name-only authoritative arrays", () => {
  for (const mode of ["칼바람", "증바람"] as const) {
    const message = inhouseTemplate(mode, ["재현", "민서"]);
    const classified = classifyKakaoV4Command({ profileId: "FEATURES", text: message });
    const canonical = canonicalizeKakaoV4Command(classified, envelope("FEATURES", message, mode === "칼바람" ? 130 : 131));
    assert.ok(canonical, `${mode}: intentional 501 remains until the snapshot is canonicalized`);
    assert.deepEqual(valuesFromCanonicalSnapshot(canonical), ["재현", "민서"]);
  }
});

test("[P3-S01] SCRIM initial form keeps the exact V1 dated template", async () => {
  await expectExactReply("RECRUIT", "스크림구인", fixture.scrim.initialTemplate, 200);
});

for (const [index, form] of [SCRIM_NEW_FORM, SCRIM_EDIT_FORM].entries()) {
  test(`[P3-S0${index + 2}] SCRIM ${index === 0 ? "new" : "edit"} full form is dispatched once with exact V1 reply`, async () => {
    const expected = index === 0 ? fixture.scrim.newFormReply : SCRIM_EDIT_REPLY;
    const qa = harness({ replies: { [form]: expected } });
    const result = await qa.service.execute(envelope("RECRUIT", form, 201 + index), "current");
    assert.equal(result.kind, "REPLY", "full SCRIM form must not remain 501");
    if (result.kind === "REPLY") assert.equal(result.reply, expected);
    assert.equal(qa.dispatches.length, 1, "one command must cause one server dispatch");
  });
}

for (const [index, reason] of ["NO_ACTIVE_TOURNAMENT", "AMBIGUOUS_ACTIVE_TOURNAMENT"].entries()) {
  test(`[P3-S0${index + 4}] SCRIM active tournament failure ${reason} maps to INVALID_FORM`, async () => {
    const text = SCRIM_NEW_FORM.replace("번호: #7", `번호: #${8 + index}`);
    const qa = harness({ invalidTexts: new Set([text]) });
    await assert.rejects(
      () => qa.service.execute(envelope("RECRUIT", text, 210 + index), "current"),
      (error) => error instanceof KakaoV4CommandError && error.code === "INVALID_FORM",
    );
    const response = kakaoV4CommandFailureResponse(
      new KakaoV4CommandError("INVALID_FORM"),
      `trace-${reason.toLowerCase()}`,
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_FORM");
  });
}

const OPERATION_FORMS = [
  ["friends", "지인 이름: 친구\n지인 닉네임: Friend#KR1\n이용기간: 장기\n디스코드 닉네임 변경: 네"],
  ["suggestions", "본인 이름 및 닉네임: 홍길동/테스터\n건의 사유: 편의성\n건의 내용: 모바일 개선"],
  ["meetups", "주최자 이름 및 닉네임: 홍길동/테스터\n일자: 2026-09-12\n장소: 서울\n참여자 명단: 재현, 민서"],
  ["leaves", "이름 및 닉네임: 신청자/닉\n외출기간: 2026-09-10 ~ 2026-09-12\n외출사유: 여행\n외출범위: 소통방"],
] as const;

for (const [index, [formType, text]] of OPERATION_FORMS.entries()) {
  test(`[P3-O0${index + 1}] OPERATIONS ${formType} complete form dispatches once and passes through exact server reply`, async () => {
    const qa = harness({ replies: { [text]: OPERATION_SUCCESS_REPLY } });
    const result = await qa.service.execute(envelope("FEATURES", text, 300 + index), "current");
    assert.equal(result.kind, "REPLY", `${formType}: complete form must not remain 501`);
    if (result.kind === "REPLY") assert.equal(result.reply, OPERATION_SUCCESS_REPLY);
    assert.equal(qa.dispatches.length, 1);
  });
}

for (const [index, [formType, text]] of OPERATION_FORMS.entries()) {
  test(`[P3-O0${index + 5}] OPERATIONS ${formType} missing required values returns an explicit V1 error without dispatch`, async () => {
    const missing = text.replace(/:\s*[^\n]*/gu, ":");
    const requiredFields = {
      friends: ["지인 이름", "지인 닉네임", "이용기간"],
      suggestions: ["건의 사유", "건의 내용"],
      meetups: ["일자", "장소", "참여자 명단"],
      leaves: ["외출기간", "외출사유", "외출범위"],
    } as const;
    const expected = `[K-LOL.GG 양식 필드 누락]\n필수 항목을 확인해 주세요: ${requiredFields[formType].join(", ")}`;
    const qa = harness();
    const result = await qa.service.execute(envelope("FEATURES", missing, 310 + index), "current");
    assert.equal(result.kind, "REPLY", `${formType}: invalid form must not remain 501`);
    if (result.kind === "REPLY") assert.equal(result.reply, expected);
    if (formType === "leaves") assert.equal(expected, fixture.operationForms.missingFieldsReply);
    assert.equal(qa.dispatches.length, 0, "invalid form must not reach a mutation port");
  });
}

const MANAGED_REPLY_CASES = [
  ["등록", fixture.exactReplies.registrationHub],
  ["내전등록", fixture.exactReplies.inhouseResultGuide],
  ["경고등록", fixture.exactReplies.disciplineCreateGuide],
  ["인증", fixture.exactReplies.disciplineEvidenceGuide],
  ["경고현황", fixture.exactReplies.disciplineStatusGuide],
  ["결과현황", fixture.exactReplies.inhouseResultStatusGuide],
  ["사진취소", fixture.exactReplies.registrationHub],
  ["자동공지 20", NOTICE_REPLY],
] as const;

for (const [index, [command, expected]] of MANAGED_REPLY_CASES.entries()) {
  test(`[P3-M${String(index + 1).padStart(2, "0")}] OPERATIONS ${command} keeps exact V1 reply parity`, async () => {
    await expectExactReply("FEATURES", command, expected, 400 + index);
  });
}

test("[P3-A01] Phase 3 authorization is installation/profile based and never receives room, sender or role", async () => {
  const qa = harness();
  for (const [index, text] of ["내전현황", "등록", "자동공지 20"].entries()) {
    await qa.service.execute(envelope("FEATURES", text, 500 + index, index % 2 ? "b" : "a"), "current");
  }
  assert.equal(qa.authorizations.length, 3);
  assert.doesNotMatch(JSON.stringify(qa.authorizations), /room|sender|role|member|allowlist/iu);
});

test("[P3-A02] two ordinary senders can use the same Phase 3 command without a sender allowlist", async () => {
  const expected = fixture.exactReplies.registrationHub;
  const qa = harness({ replies: { 등록: expected } });
  const first = await qa.service.execute(envelope("FEATURES", "등록", 510, "a"), "current");
  const second = await qa.service.execute(envelope("FEATURES", "등록", 511, "b"), "current");
  assert.deepEqual([first.kind, second.kind], ["REPLY", "REPLY"]);
  if (first.kind === "REPLY" && second.kind === "REPLY") assert.deepEqual([first.reply, second.reply], [expected, expected]);
});

test("[P3-R01] identical eventId replays one successful Phase 3 mutation without a second dispatch", async () => {
  const text = inhouseTemplate("협곡", ["재현/P/E/AD/MD"]);
  const expected = "[K-LOL.GG 내전 #2 명단 업데이트]\n현재: 1/10";
  const qa = harness({ replies: { [text]: expected } });
  const request = envelope("FEATURES", text, 600);
  const first = await qa.service.execute(request, "current");
  const replay = await qa.service.execute(request, "current");
  assert.equal(first.kind, "REPLY");
  assert.equal(first.replayed, false);
  assert.equal(replay.kind, "REPLY");
  assert.equal(replay.replayed, true);
  assert.equal(qa.dispatches.length, 1);
});

test("[P3-R02] same eventId with a conflicting body maps to public HTTP 409 REPLAY_CONFLICT", async () => {
  const qa = harness();
  const request = envelope("FEATURES", "내전현황", 610);
  await qa.service.execute(request, "current");
  await assert.rejects(
    () => qa.service.execute({ ...request, text: "등록" }, "current"),
    (error) => error instanceof KakaoV4CommandError && error.code === "IDEMPOTENCY_MISMATCH",
  );
  const response = kakaoV4ProblemResponse("IDEMPOTENCY_MISMATCH", "trace-phase3-replay-conflict");
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "REPLAY_CONFLICT");
});
