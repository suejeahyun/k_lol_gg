import assert from "node:assert/strict";
import test from "node:test";

import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import type { KakaoV4CommandEnvelope } from "../src/modules/recruiting/kakao-v4/domain";
import { createRecruitParty, mutateRecruitPartyMember } from "../src/modules/recruiting/domain/recruiting";

const code = "ABCDE-23456";
const envelope = (text: string, timestamp = Date.parse("2026-10-13T20:59:59Z") / 1_000): KakaoV4CommandEnvelope => ({
  profileId: "RECRUIT", installationId: "install-11111111111111111111111111111111",
  senderId: "sender-user-22222222222222222222222222222222", eventId: "event-fixed-code-command",
  timestamp, nonce: "3".repeat(32), text,
});

test("fixed code aliases preserve the identity and operation across the operating-day boundary", () => {
  for (const [text, command, operation, name] of [
    [`구인상세 ${code}`, "PARTY_DETAIL", "DETAIL"],
    [`상세 ${code.toLowerCase()}`, "PARTY_DETAIL", "DETAIL"],
    ["상세 ＡＢＣＤＥ－２３４５６", "PARTY_DETAIL", "DETAIL"],
    [`구인마감 ${code}`, "PARTY_FINISH", "FINISH"],
    [`구인쫑 ${code}`, "PARTY_FINISH", "FINISH"],
    [`구인종료 ${code}`, "PARTY_FINISH", "FINISH"],
    [`${code}ㅉ`, "PARTY_FINISH", "FINISH"],
    [`${code} 쫑`, "PARTY_FINISH", "FINISH"],
    [`상세 ${code} 추가 별 빛`, "PARTY_MEMBER_ADD", "ADD_MEMBER", "별 빛"],
    [`구인상세 ${code} 삭제 홍길동`, "PARTY_MEMBER_REMOVE", "REMOVE_MEMBER", "홍길동"],
    [`상세 ${code} 삭재 홍길동`, "PARTY_MEMBER_REMOVE", "REMOVE_MEMBER", "홍길동"],
  ] as const) {
    for (const variant of [text, `/${text}`]) {
      const classification = classifyKakaoV4Command({ profileId: "RECRUIT", text: variant });
      assert.equal(classification.kind, "COMMAND", variant);
      if (classification.kind !== "COMMAND") continue;
      assert.equal(classification.command, command, variant);
      assert.deepEqual(classification.parameters, { recruitCode: code, ...(name ? { name } : {}) });
      const expected = { domain: "PARTY", action: "BY_CODE", operation, recruitCode: code, ...(name ? { name } : {}) };
      assert.deepEqual(canonicalizeKakaoV4Command(classification, envelope(variant), new Date((envelope(variant)).timestamp * 1_000)), expected, variant);
      assert.deepEqual(canonicalizeKakaoV4Command(classification, envelope(variant, Date.parse("2026-10-13T21:00:01Z") / 1_000), new Date((envelope(variant, Date.parse("2026-10-13T21:00:01Z") / 1_000)).timestamp * 1_000)), expected);
      assert.equal(classifyKakaoV4Command({ profileId: "FEATURES", text: variant }).kind, "WRONG_PROFILE", variant);
    }
  }
});

test("fixed code commands reject malformed identity, multiple edits, and ordinary conversation", () => {
  for (const text of [
    `//상세 ${code}`, `/ 상세 ${code}`, `오늘 상세 ${code}`, `상세 ${code}@1`,
    "상세 ABCD0-23456", "구인마감 ABCD1-23456", "ABCDE-2345ㅉ", `내전상세 ${code}`,
    `상세 ${code} 추가`, `상세 ${code} 추가 가,나`, `상세 ${code} 추가 가/나`,
    `상세 ${code} 추가 가;나`, `상세 ${code} 추가 가\n삭제 나`, `상세 ${code} 삭제 삭제 가`,
    `상세 ${code} 추가 ${"가".repeat(81)}`, `상세 ${code} 삭제 가\u202e나`,
  ]) assert.equal(classifyKakaoV4Command({ profileId: "RECRUIT", text }).kind, "UNKNOWN", text);
});

test("party quick additions preserve compatibility-jamo nicknames through storage", () => {
  for (const target of ["3", code, "ＡＢＣＤＥ－２３４５６"]) {
    for (const name of ["ㅁㅂㅅ", "ㄱㅏ", "별빛 ㅋㅋ"]) {
      const text = `상세 ${target} 추가 ${name}`;
      const classification = classifyKakaoV4Command({ profileId: "RECRUIT", text });
      const command = canonicalizeKakaoV4Command(classification, envelope(text), new Date("2026-10-13T12:00:00Z"));
      assert.ok(command?.domain === "PARTY" && (command.action === "ADD_MEMBER" || command.action === "BY_CODE" && command.operation === "ADD_MEMBER"));
      assert.equal(command.name, name);
      const party = createRecruitParty({ id: "synthetic-jamo-party", sourceRoomId: "synthetic-room", sourceSenderId: "synthetic-sender",
        recruitDate: "2026-10-13", resetSequence: 0, recruitNumber: 3, type: "PARTY_NUMBER", title: "5인 파티", maximumMembers: 5,
        members: [], now: new Date("2026-10-13T12:00:00Z") });
      const stored = mutateRecruitPartyMember({ party, mutation: { action: "ADD", name: command.name }, now: new Date("2026-10-13T12:00:01Z") });
      assert.equal(stored.party.members[0]?.name, name);
    }
  }
});

test("numeric commands keep current-day targets and canonicalizer validates code parameters again", () => {
  const text = "상세 3 추가 홍길동";
  const classified = classifyKakaoV4Command({ profileId: "RECRUIT", text });
  assert.equal(classified.kind, "COMMAND");
  if (classified.kind !== "COMMAND") return;
  assert.deepEqual(canonicalizeKakaoV4Command(classified, envelope(text), new Date((envelope(text)).timestamp * 1_000)), {
    domain: "PARTY", action: "ADD_MEMBER", target: { recruitDate: "2026-10-13", recruitNumber: 3 }, name: "홍길동",
  });
  assert.equal(canonicalizeKakaoV4Command({ ...classified, parameters: { ...classified.parameters, recruitCode: "wrong-code" } }, envelope(text), new Date((envelope(text)).timestamp * 1_000)), null);
  assert.equal(canonicalizeKakaoV4Command({ ...classified, parameters: { recruitCode: code } }, envelope(text), new Date((envelope(text)).timestamp * 1_000)), null);
});
