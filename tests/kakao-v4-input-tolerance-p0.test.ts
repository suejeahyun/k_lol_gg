import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { KakaoV4CommandService } from "../src/modules/recruiting/kakao-v4/application";
import { canonicalizeKakaoV4Command, type CanonicalKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import {
  KakaoV4CommandDispatcher,
  KakaoV4DispatcherError,
  type KakaoV4AssistantPort,
  type KakaoV4DispatcherResult,
  type KakaoV4RecruitingPort,
} from "../src/modules/recruiting/kakao-v4/dispatcher";
import type { KakaoV4CommandEnvelope, KakaoV4ProfileId } from "../src/modules/recruiting/kakao-v4/domain";
import type { RecruitingCommand } from "../src/modules/recruiting/application/commands";
import type { RecruitingCommandResult } from "../src/modules/recruiting/application/ports";
import type { OperationFormPayloadByType } from "../src/modules/recruiting/operation-forms/domain";

type V1Fixture = Readonly<{
  contractVersion: string;
  source: Readonly<{ v1Artifact: string; v1Sha256: string }>;
  party: Readonly<{ initialFivePersonTemplate: string }>;
  operationForms: Readonly<{ forms: Readonly<Record<string, readonly string[]>> }>;
}>;

const fixture = JSON.parse(await readFile(
  resolve(import.meta.dirname, "fixtures/kakao-v4-v1-compatibility-contract.json"),
  "utf8",
)) as V1Fixture;

const PARTY_ORACLE = fixture.party.initialFivePersonTemplate;
const KST_TIMESTAMP = Date.parse("2026-09-10T03:00:00.000Z") / 1_000;

function envelope(profileId: KakaoV4ProfileId, text: string, eventId: string, senderId = "sender-user-11111111111111111111111111111111"): KakaoV4CommandEnvelope {
  return {
    profileId,
    installationId: "install-11111111111111111111111111111111",
    senderId,
    eventId,
    timestamp: KST_TIMESTAMP,
    nonce: "9".repeat(32),
    text,
  };
}

function canonical(profileId: KakaoV4ProfileId, text: string, eventId = "event-input-tolerance-0001") {
  const input = envelope(profileId, text, eventId);
  return canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId, text }), input);
}

function partySync(text: string) {
  const command = canonical("RECRUIT", text);
  assert.equal(command?.domain, "PARTY");
  assert.equal(command?.action, "SYNC");
  if (command?.domain !== "PARTY" || command.action !== "SYNC") assert.fail("expected PARTY/SYNC");
  return command;
}

function replaceRow(slot: number, replacement: string) {
  return PARTY_ORACLE.replace(`\n${String(slot)}.\n`, `\n${replacement}\n`);
}

function partyDispatcherHarness() {
  const handled: RecruitingCommand[] = [];
  const recruiting: KakaoV4RecruitingPort = {
    async resolveCompatTarget() { return { id: "00000000-0000-4000-8000-000000000012", revision: 4 }; },
    async resolveScrimUpsert() { throw new Error("unexpected scrim lookup"); },
    async handle(command) {
      handled.push(command);
      return {
        body: { data: { recruitNumber: 12, maximumMembers: 5, startTimeText: "21:00", gameInfo: "미입력" } },
        revision: 5,
        replayed: false,
      } as unknown as RecruitingCommandResult;
    },
  };
  const assistant = {} as KakaoV4AssistantPort;
  const dispatcher = new KakaoV4CommandDispatcher({ recruiting, assistant });
  return {
    handled,
    async dispatch(text: string, eventId: string) {
      const input = envelope("RECRUIT", text, eventId);
      const command = canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "RECRUIT", text }), input);
      assert.equal(command?.domain, "PARTY");
      if (command?.domain !== "PARTY") assert.fail("expected PARTY command");
      return dispatcher.dispatch({
        envelope: input,
        keyId: "current",
        requestDigestHex: "ab".repeat(32),
        requestId: eventId,
        authorization: {
          roomId: "00000000-0000-4000-8000-000000000001",
          roomStatus: "ACTIVE",
          capabilityProfile: "RECRUIT",
          installationId: "00000000-0000-4000-8000-000000000002",
        },
      }, command);
    },
  };
}

test("[P0-FIXTURE] input-tolerance matrix is pinned to the unchanged V1 oracle", () => {
  assert.equal(fixture.contractVersion, "KLOL_KAKAO_V4_V1_COMPAT_2026_09_10_R1");
  assert.equal(fixture.source.v1Artifact, "pasted-text.txt (delegated attachment; not committed)");
  assert.equal(fixture.source.v1Sha256, "c91a56a289a762fe7e08143e8fd4b55c9695c4df68ebfcb6689613dcb73776b7");
  assert.deepEqual(Object.keys(fixture.operationForms.forms).sort(), ["friends", "leaves", "meetups", "suggestions"]);
  assert.match(PARTY_ORACLE, /^\[K-LOL\.GG 구인구직 양식\]/u);
  assert.match(PARTY_ORACLE, /^모집번호: #12$/mu);
});

test("[P0-PARTY-01] punctuation, full-width, escape, and whitespace rows have one semantic member", () => {
  const rows = ["2. 테스터", "2) 테스터", "2 테스터", "２． 테스터", String.raw`2\. 테스터`, "  2  .   테스터  "];
  for (const [index, row] of rows.entries()) {
    const command = partySync(replaceRow(2, row));
    assert.deepEqual(command.payload.members, [
      { slotNo: 2, name: "테스터", position: null, substitute: false },
    ], `${String(index)}:${row}`);
  }
});

test("[P0-PARTY-02] an explicit empty slot is valid but an absent slot row is not a full snapshot", () => {
  assert.deepEqual(partySync(PARTY_ORACLE).payload.members, []);
  const absent = PARTY_ORACLE.replace("\n3.\n", "\n");
  assert.equal(classifyKakaoV4Command({ profileId: "RECRUIT", text: absent }).kind, "UNKNOWN");
  assert.equal(canonical("RECRUIT", absent), null);
});

test("[P0-PARTY-03] slash and comma in one reserve row stay in one display name", () => {
  const command = partySync(PARTY_ORACLE.replace("예비 1.", "예비 1. 후보A/후보B, 후보C"));
  assert.deepEqual(command.payload.members, [
    { slotNo: 1, name: "후보A/후보B, 후보C", position: null, substitute: true },
  ]);
});

test("[P0-PARTY-04] a 2-person title cannot overwrite an existing 5-person recruit target", async () => {
  const tampered = PARTY_ORACLE.replace("📢 5인 파티 구인", "📢 2인 파티 구인").replace("\n3.\n4.\n5.", "");
  const harness = partyDispatcherHarness();
  await harness.dispatch(tampered, "event-title-tamper-000001");
  assert.equal(harness.handled.length, 1);
  const command = harness.handled[0];
  assert.equal(command?.type, "SYNC_PARTY");
  if (command?.type === "SYNC_PARTY") {
    assert.equal("title" in command.payload, false);
    assert.equal("maximumMembers" in command.payload, false);
  }
});

test("[P0-PARTY-05] conflicting duplicate slot rows reject the whole snapshot", () => {
  const duplicate = replaceRow(2, "2. 테스터A\n2. 테스터B");
  assert.equal(canonical("RECRUIT", duplicate), null);
});

test("[P0-PARTY-06] member order is canonical and independent of pasted row order", () => {
  const ordered = replaceRow(1, "1. 테스터A").replace("\n2.\n", "\n2. 테스터B\n");
  const reversed = ordered.replace("\n1. 테스터A\n2. 테스터B\n", "\n2. 테스터B\n1. 테스터A\n");
  assert.deepEqual(partySync(reversed).payload.members, partySync(ordered).payload.members);
});

test("[P0-PARTY-07] name suffix notes, emoji, and Kakao tags are preserved", () => {
  for (const [row, name] of [
    ["2. 테스터 (MID)", "테스터 (MID)"],
    ["2. 테스터 - 9시 가능", "테스터 - 9시 가능"],
    ["2. 테스터 🎮", "테스터 🎮"],
    ["2. 테스터 @참여자", "테스터 @참여자"],
  ] as const) {
    assert.deepEqual(partySync(replaceRow(2, row)).payload.members, [
      { slotNo: 2, name, position: null, substitute: false },
    ], row);
  }
});

test("[P0-PARTY-08] multiline metadata values match their single-line semantic values", () => {
  const singleLine = PARTY_ORACLE.replace("모집번호: #12", "모집번호: #12\n》시작시간: 21:00 출발\n》게임정보: 자랭 5인큐");
  const multiline = PARTY_ORACLE.replace("모집번호: #12", "모집번호: #12\n》시작시간:\n21:00 출발\n》게임정보:\n자랭 5인큐");
  const singleLinePayload = partySync(singleLine).payload;
  const multilinePayload = partySync(multiline).payload;
  assert.deepEqual(
    { startTimeText: multilinePayload.startTimeText, gameInfo: multilinePayload.gameInfo },
    { startTimeText: singleLinePayload.startTimeText, gameInfo: singleLinePayload.gameInfo },
  );
  assert.deepEqual(multilinePayload.members, []);
});

test("[P0-PARTY-09] an automatic-number empty draft never creates a recruit", async () => {
  const draft = PARTY_ORACLE.replace("모집번호: #12", "모집번호: #자동배정");
  const harness = partyDispatcherHarness();
  await assert.rejects(
    harness.dispatch(draft, "event-empty-draft-0000001"),
    (error: unknown) => error instanceof KakaoV4DispatcherError && error.code === "INVALID_FORM",
  );
  assert.equal(harness.handled.length, 0);
});

const operationCases = [
  {
    formType: "friends",
    inline: "지인 이름: 친구\n지인 닉네임: Friend#KR1\n이용기간: 장기\n디스코드 닉네임 변경: 네",
    continued: "지인 이름:\n친구\n지인 닉네임:\nFriend#KR1\n이용기간:\n장기\n디스코드 닉네임 변경:\n네",
    required: ["지인 이름", "지인 닉네임", "이용기간"],
  },
  {
    formType: "suggestions",
    inline: "본인 이름 및 닉네임: 홍길동/테스터\n건의 사유: 편의성\n건의 내용: 모바일 개선",
    continued: "본인 이름 및 닉네임:\n홍길동/테스터\n건의 사유:\n편의성\n건의 내용:\n모바일 개선",
    required: ["본인 이름 및 닉네임", "건의 사유", "건의 내용"],
  },
  {
    formType: "meetups",
    inline: "주최자 이름 및 닉네임: 홍길동/테스터\n일자: 2026-09-12\n장소: 서울\n참여자 명단: 참가자A, 참가자B",
    continued: "주최자 이름 및 닉네임:\n홍길동/테스터\n일자:\n2026-09-12\n장소:\n서울\n참여자 명단:\n참가자A\n참가자B",
    required: ["주최자 이름 및 닉네임", "일자", "장소", "참여자 명단"],
  },
  {
    formType: "leaves",
    inline: "이름 및 닉네임: 홍길동/테스터\n외출기간: 2026-09-10 ~ 2026-09-12\n외출사유: 여행\n외출범위: 소통방",
    continued: "이름 및 닉네임:\n홍길동/테스터\n외출기간:\n2026-09-10 ~ 2026-09-12\n외출사유:\n여행\n외출범위:\n소통방",
    required: ["이름 및 닉네임", "외출기간", "외출사유", "외출범위"],
  },
] as const;

test("[P0-OPS-01] all four forms preserve values continued on the following line", () => {
  for (const fixtureCase of operationCases) {
    assert.deepEqual(
      canonical("FEATURES", fixtureCase.continued),
      canonical("FEATURES", fixtureCase.inline),
      fixtureCase.formType,
    );
  }
});

test("[P0-OPS-02] all four forms expose exact missing-field contracts without submission", () => {
  for (const fixtureCase of operationCases) {
    const empty = fixtureCase.inline.replace(/:\s*[^\n]*/gu, ":");
    const command = canonical("FEATURES", empty);
    assert.equal(command?.domain, "OPERATIONS", fixtureCase.formType);
    assert.equal(command?.action, "INVALID_FORM", fixtureCase.formType);
    if (command?.domain === "OPERATIONS" && command.action === "INVALID_FORM") {
      assert.deepEqual(command.missingFields, fixtureCase.required, fixtureCase.formType);
    }
  }
});

test("[P0-OPS-03] parentheses and comma stay in the person name instead of becoming an implicit delimiter", () => {
  const command = canonical("FEATURES", "본인 이름 및 닉네임: 홍길동 (본인), 테스터\n건의 사유: 편의성\n건의 내용: 모바일 개선");
  assert.equal(command?.domain, "OPERATIONS");
  assert.equal(command?.action, "SUBMIT_FORM");
  if (command?.domain === "OPERATIONS" && command.action === "SUBMIT_FORM" && command.formType === "suggestions") {
    const payload = command.payload as OperationFormPayloadByType["suggestions"];
    assert.equal(payload.applicantName, "홍길동 (본인), 테스터");
    assert.equal(payload.applicantNickname, "홍길동 (본인), 테스터");
  }
});

test("[P0-OPS-04] ordinary conversation and partial label discussions remain UNKNOWN", () => {
  for (const text of [
    "오늘 고객센터에 건의 사유를 어떻게 적을지 이야기해 봐요.",
    "지인 이름이 기억나지 않아요. 닉네임부터 확인할게요.",
    "외출기간은 나중에 정하고 외출범위도 다시 이야기할게요.",
  ]) {
    assert.equal(classifyKakaoV4Command({ profileId: "FEATURES", text }).kind, "UNKNOWN", text);
  }
});

for (const fixtureCase of operationCases) {
  test(`[P0-OPS-05:${fixtureCase.formType}] field order does not alter the canonical payload`, () => {
    const reordered = fixtureCase.inline.split("\n").reverse().join("\n");
    assert.deepEqual(canonical("FEATURES", reordered), canonical("FEATURES", fixtureCase.inline));
  });

  test(`[P0-OPS-06:${fixtureCase.formType}] a conflicting duplicate label rejects the whole form`, () => {
    const [firstLine] = fixtureCase.inline.split("\n");
    const duplicate = `${fixtureCase.inline}\n${String(firstLine)}-상충`;
    const command = canonical("FEATURES", duplicate);
    assert.equal(command?.domain, "OPERATIONS");
    assert.equal(command?.action, "INVALID_FORM");
    if (command?.domain === "OPERATIONS" && command.action === "INVALID_FORM") {
      assert.deepEqual(command.missingFields, [String(firstLine).split(":")[0]]);
    }
  });

  test(`[P0-OPS-07:${fixtureCase.formType}] arbitrary footer text cannot contaminate the last field`, () => {
    assert.deepEqual(canonical("FEATURES", `${fixtureCase.inline}\n감사합니다. 문의는 별도 채널을 이용해 주세요.`), canonical("FEATURES", fixtureCase.inline));
  });
}

test("[P0-OPS-08] prose mentioning every label is not classified as a form", () => {
  const prose = "지인 이름, 지인 닉네임, 이용기간, 디스코드 닉네임 변경 항목을 안내문에서 읽었습니다.";
  assert.equal(classifyKakaoV4Command({ profileId: "FEATURES", text: prose }).kind, "UNKNOWN");
});

function recordingService() {
  const calls: Readonly<{ envelope: KakaoV4CommandEnvelope; command: CanonicalKakaoV4Command }>[] = [];
  const authorizer = {
    async authorizeProfile(input: Readonly<{ requiredCapabilityProfile: KakaoV4ProfileId }>) {
      return {
        roomId: "00000000-0000-4000-8000-000000000001",
        roomStatus: "ACTIVE" as const,
        capabilityProfile: input.requiredCapabilityProfile,
        installationId: "00000000-0000-4000-8000-000000000002",
      };
    },
  };
  const dispatcher = {
    async dispatch(context: Readonly<{ envelope: KakaoV4CommandEnvelope }>, command: CanonicalKakaoV4Command): Promise<KakaoV4DispatcherResult> {
      calls.push({ envelope: context.envelope, command });
      return { kind: "PARTY", action: command.action, aggregate: null, legacyReply: "fixture accepted", replayed: false };
    },
  } as unknown as KakaoV4CommandDispatcher;
  return { calls, service: new KakaoV4CommandService(authorizer, dispatcher) };
}

test("[P0-IDEMPOTENCY-01] the same event is dispatched exactly once and then replayed", async () => {
  const { calls, service } = recordingService();
  const input = envelope("RECRUIT", replaceRow(2, "2. 테스터"), "event-input-tolerance-replay-0001");
  const first = await service.execute(input, "current");
  const replay = await service.execute(input, "current");
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(calls.length, 1);
});

test("[P0-IDEMPOTENCY-02] different events with one semantic payload are both dispatched", async () => {
  const { calls, service } = recordingService();
  await service.execute(envelope("RECRUIT", replaceRow(2, "2.테스터"), "event-semantic-a-00000001"), "current");
  await service.execute(envelope("RECRUIT", replaceRow(2, "２． 테스터"), "event-semantic-b-00000001"), "current");
  assert.equal(calls.length, 2);
  const semanticPartyFields = (command: CanonicalKakaoV4Command | undefined) => {
    assert.equal(command?.domain, "PARTY");
    assert.equal(command?.action, "SYNC");
    if (command?.domain !== "PARTY" || command.action !== "SYNC") assert.fail("expected PARTY/SYNC");
    return {
      target: command.target,
      members: command.payload.members,
      startTimeText: command.payload.startTimeText,
      gameInfo: command.payload.gameInfo,
      partyType: command.payload.partyType,
      title: command.payload.title,
      maximumMembers: command.payload.maximumMembers,
    };
  };
  assert.deepEqual(semanticPartyFields(calls[0]?.command), semanticPartyFields(calls[1]?.command));
});

test("[P0-MULTIUSER-01] same-room events from different senders reach edit and finish dispatch", async () => {
  const { calls, service } = recordingService();
  await service.execute(envelope("RECRUIT", replaceRow(1, "1. 작성자"), "event-multiuser-edit-0001", "sender-user-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), "current");
  await service.execute(envelope("RECRUIT", "12ㅉ", "event-multiuser-finish-01", "sender-user-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), "current");
  assert.deepEqual(calls.map(({ command }) => command.action), ["SYNC", "FINISH"]);
  assert.notEqual(calls[0]?.envelope.senderId, calls[1]?.envelope.senderId);
});

test.todo("[P0-MULTIUSER-02] PostgreSQL contract proves same-room cross-user edit/finish and different-room no-mutation");
