import assert from "node:assert/strict";
import test from "node:test";

import type { KakaoOpenChatStatusDto } from "../src/modules/recruiting/kakao-assistant/domain";
import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import { KakaoV4CommandDispatcher, type KakaoV4DispatchContext } from "../src/modules/recruiting/kakao-v4/dispatcher";
import { KAKAO_V1_STRICT_PROTOCOL, KAKAO_V1_STRICT_RESPONSE_FORMAT, type KakaoV4CommandEnvelope } from "../src/modules/recruiting/kakao-v4/domain";
import { parsePartyForm } from "../src/modules/recruiting/kakao-v4/party-snapshot-parser";
import { v1StrictPartyDetailReply, v1StrictPartyTemplate } from "../src/modules/recruiting/kakao-v4/v1-strict-party-replies";

const code = "ABCDE-23456";
const identity = `모집코드: ${code}\n명단버전: 3`;
const party: KakaoOpenChatStatusDto["parties"][number] = {
  id: "party-stable-code-12", revision: 2, recruitDate: "2026-10-14", resetSequence: 0,
  recruitNumber: 12, type: "PARTY_NUMBER", title: "5인 파티", status: "IN_PROGRESS",
  memberCount: 1, reserveCount: 0, maximumMembers: 5,
  members: [{ name: "기존", position: null, slotNo: 1, substitute: false }],
  startTimeText: "ㅁㅂㅅ", gameInfo: "합성 게임", organizerText: null, scheduledStartAt: null,
  formCode: `${code}@3`,
};

function envelope(text: string): KakaoV4CommandEnvelope {
  return {
    profileId: "RECRUIT", installationId: `install-${"1".repeat(32)}`,
    senderId: `sender-user-${"2".repeat(32)}`, eventId: "event-stable-code-party",
    timestamp: Date.parse("2026-10-14T12:00:00.000Z") / 1_000, nonce: "4".repeat(32), text,
  };
}

function canonical(text: string) {
  return canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "RECRUIT", text }), envelope(text));
}

test("stable party identity renders as two lines and round-trips every party template", () => {
  for (const [partyType, maximumMembers] of [
    ["PARTY_NUMBER", 5], ["FLEX_RANK", 5], ["NORMAL_GAME", 5], ["PARTY_RIFT", 5],
    ["SOLO_RANK", 2], ["ARAM", 5], ["TFT_NORMAL", 8], ["TFT_RANK", 3], ["DOUBLE_UP", 2], ["OTHER_GAME", 8],
  ] as const) {
    for (const version of [1, 2, Number.MAX_SAFE_INTEGER]) {
      const form = v1StrictPartyTemplate({
        recruitNumber: 12, recruitDate: party.recruitDate, partyType, maximumMembers,
        title: "", formCode: `${code}@${version}`,
      });
      assert.ok(form.includes(`모집코드: ${code}\n명단버전: ${version}`), partyType);
      assert.doesNotMatch(form, /양식코드|@/u, partyType);
      const parsed = parsePartyForm(form);
      assert.equal(parsed.decision, "EXACT", `${partyType}: ${JSON.stringify(parsed.diagnostics)}`);
      assert.equal(parsed.saveReference, `${code}@${version}`);
      assert.equal(parsed.submittedTitle?.partyType, partyType);
      assert.equal(parsed.slots.find((slot) => slot.kind === "RESERVE")?.value, null);
    }
  }
});

test("a copied saved-result envelope preserves stable identity and the submitted names", () => {
  const detail = v1StrictPartyDetailReply(party, 12);
  assert.ok(detail.includes(identity));
  const edited = detail.replace("2.\n", "2. 합성 Ａ\n");
  for (const input of [edited, `✅ 저장했어요.\n\n${edited}`, `/${edited}`, edited.replaceAll("\n", "\r\n")]) {
    const command = canonical(input);
    if (command?.domain !== "PARTY" || command.action !== "SYNC") assert.fail("stable party form must canonicalize");
    assert.equal(command.payload.parsedForm?.saveReference, `${code}@3`);
    assert.equal(command.payload.members[1]?.name, "합성 Ａ");
    assert.equal(command.payload.parsedForm.startTime.value, "ㅁㅂㅅ");
  }
  const later = v1StrictPartyDetailReply({ ...party, formCode: `${code}@4` }, 12);
  assert.ok(later.includes(`모집코드: ${code}\n명단버전: 4`));
});

test("party identity requires one complete pair and rejects malformed or mixed references", () => {
  const form = v1StrictPartyDetailReply(party, 12);
  const invalidIdentities = [
    "", `모집코드: ${code}`, "명단버전: 3", `모집코드: \n명단버전: 3`, `모집코드: ${code}\n명단버전:`,
    `${identity}\n모집코드: ${code}`, `${identity}\n모집코드: BCDEF-23456`,
    `${identity}\n명단버전: 3`, `${identity}\n명단버전: 4`,
    `${identity}\n양식코드: ${code}`, `${identity}\n양식코드 ${code}`,
    `${identity}\n저장기준: 2026-10-14 / P${"a".repeat(32)}-R2`,
    `모집코드 ${code}\n명단버전: 3`, `모집코드: ${code}\n명단버전 3`,
    `${identity}\n명단버전`, `양식코드: ${code}@3`,
    ...["0", "-1", "01", "+1", "1.0", "1e1", "1 2", "NaN", "Infinity", "9007199254740992", "3 (그대로 두세요)"].map((version) => `모집코드: ${code}\n명단버전: ${version}`),
    ...["ABCDE-12345", "ABCDE-23456@3", "ABCDE-2345I", "abcde-23456", "깨짐"].map((value) => `모집코드: ${value}\n명단버전: 3`),
  ];
  for (const replacement of invalidIdentities) {
    const input = form.replace(identity, replacement);
    const parsed = parsePartyForm(input);
    assert.equal(parsed.decision, "REJECT", replacement);
    assert.ok(parsed.diagnostics.some((item) => item.code === "INVALID_SAVE_REFERENCE"), replacement);
    assert.equal(canonical(input), null, replacement);
  }
});

test("code and version labels never become blank metadata or member continuation values", () => {
  const header = "[파티 #12] 5인 파티 · 0/5명";
  const slots = ["1.", "2.", "3.", "4.", "5.", "예비 1."];
  const forms = [
    [header, "시작 시간 :", `모집코드: ${code}`, "게임 종류 :", "명단버전: 3", ...slots],
    [header, "시작 시간 :", "게임 종류 :", ...slots, identity],
    [header, "시작 시간 :", "게임 종류 :", slots[0], identity, ...slots.slice(1)],
  ];
  for (const lines of forms) {
    const parsed = parsePartyForm(lines.join("\n"));
    assert.equal(parsed.decision, "EXACT", JSON.stringify(parsed.diagnostics));
    assert.equal(parsed.startTime.value, null);
    assert.equal(parsed.gameInfo.value, null);
    assert.ok(parsed.slots.every((slot) => slot.value === null));
    assert.equal(parsed.saveReference, `${code}@3`);
  }
  const malformed = parsePartyForm([header, "시작 시간 :", `모집코드 ${code}`, "게임 종류 :", "명단버전 3", ...slots].join("\n"));
  assert.equal(malformed.decision, "REJECT");
  assert.equal(malformed.startTime.value, null);
  assert.equal(malformed.gameInfo.value, null);
});

test("stable structural fullwidth copy normalization preserves jamo metadata and legacy codes", () => {
  const form = v1StrictPartyDetailReply(party, 12).replace(identity, "모집 코드： ＡＢＣＤＥ-２３４５６\n명단 버전： ３");
  const parsed = parsePartyForm(form);
  assert.equal(parsed.decision, "EXACT");
  assert.equal(parsed.saveReference, `${code}@3`);
  assert.equal(parsed.startTime.value, "ㅁㅂㅅ");
  const legacy = v1StrictPartyDetailReply({ ...party, formCode: code }, 12);
  assert.ok(legacy.includes(`양식코드: ${code}`));
  assert.doesNotMatch(legacy, /모집코드|명단버전/u);
  assert.equal(parsePartyForm(legacy).saveReference, code);
  assert.equal(parsePartyForm(legacy).decision, "EXACT");
});

test("strict and ordinary creation replies both expose the same fixed-code form", async () => {
  for (const strict of [true, false]) {
    const base = envelope("5인파티");
    const context: KakaoV4DispatchContext = {
      envelope: strict ? { ...base, protocol: KAKAO_V1_STRICT_PROTOCOL, responseFormat: KAKAO_V1_STRICT_RESPONSE_FORMAT } : base,
      keyId: "current", requestDigestHex: "1".repeat(64), requestId: "stable-code-render",
      authorization: { roomId: "00000000-0000-4000-8000-000000000001", roomStatus: "ACTIVE", capabilityProfile: "RECRUIT", installationId: "00000000-0000-4000-8000-000000000002" },
    };
    const dispatcher = new KakaoV4CommandDispatcher({
      recruiting: {
        async handle(command) {
          assert.equal(command.type, "CREATE_PARTY");
          return {
            body: { aggregateKind: "PARTY", aggregateId: command.aggregateId, revision: 0, status: "DRAFT", commandType: command.type,
              data: { recruitNumber: 12, formCode: `${code}@1` } },
            revision: 0, replayed: false,
          };
        },
        async resolveCompatTarget() { return null; },
        async resolveScrimUpsert() { return null; },
      },
      assistant: { async getOpenChatStatus() { throw new Error("not used"); }, async syncSeasonSnapshot() { throw new Error("not used"); } },
    });
    const command = canonical("5인파티");
    assert.ok(command);
    const result = await dispatcher.dispatch(context, command);
    assert.ok(result.legacyReply.includes(`모집코드: ${code}\n명단버전: 1`));
    assert.equal(parsePartyForm(result.legacyReply).saveReference, `${code}@1`);
    assert.equal(parsePartyForm(result.legacyReply).decision, "EXACT");
  }
});
