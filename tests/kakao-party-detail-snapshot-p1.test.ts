import assert from "node:assert/strict";
import test from "node:test";

import type { KakaoOpenChatStatusDto } from "../src/modules/recruiting/kakao-assistant/domain";
import { partyCopyReference } from "../src/modules/recruiting/application/party-copy-reference";
import { createRecruitParty, mergeRecruitPartySlotPatches, syncRecruitParty } from "../src/modules/recruiting/domain/recruiting";
import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import type { KakaoV4CommandEnvelope } from "../src/modules/recruiting/kakao-v4/domain";
import { parsePartyForm } from "../src/modules/recruiting/kakao-v4/party-snapshot-parser";
import { v1StrictPartyDetailReply, v1StrictPartyStatusReply, v1StrictPartyTemplate } from "../src/modules/recruiting/kakao-v4/v1-strict-party-replies";

const party: KakaoOpenChatStatusDto["parties"][number] = {
  id: "party-12",
  revision: 4,
  recruitDate: "2026-09-11",
  resetSequence: 0,
  recruitNumber: 12,
  type: "PARTY_NUMBER",
  title: "5인 파티",
  status: "IN_PROGRESS",
  memberCount: 1,
  reserveCount: 1,
  maximumMembers: 5,
  members: [
    { name: "기존", position: null, slotNo: 1, substitute: false },
    { name: "대기/부캐, 메모", position: null, slotNo: 1, substitute: true },
  ],
  startTimeText: "21:00",
  gameInfo: "자유랭크",
  organizerText: "주최자",
  scheduledStartAt: null,
};

function envelope(text: string): KakaoV4CommandEnvelope {
  return {
    profileId: "RECRUIT",
    installationId: "install-11111111111111111111111111111111",
    senderId: "sender-user-22222222222222222222222222222222",
    eventId: "event-party-detail-p1",
    timestamp: Date.parse("2026-09-11T12:00:00.000Z") / 1_000,
    nonce: "4".repeat(32),
    text,
  };
}

function canonical(text: string) {
  return canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "RECRUIT", text }), envelope(text));
}

test("R24 compact party form keeps the complete saved-result envelope copyable with one new name", () => {
  const original = { ...party, formCode: "ABCDE-23456", organizerText: null };
  const detail = v1StrictPartyDetailReply(original, 12);
  assert.match(detail, /^\[파티 #12\] 5인 파티 · 1\/5명$/mu);
  assert.match(detail, /양식코드: ABCDE-23456/u);
  assert.doesNotMatch(detail, /저장기준|운영일|주최자/u);
  assert.ok(detail.indexOf("양식코드:") > detail.indexOf("예비 2."));

  const edited = `신청 저장: 기존\n\n${detail.replace("2.\n", "2. 민규\n")}`;
  const parsed = parsePartyForm(edited);
  assert.equal(parsed.decision, "EXACT");
  assert.equal(parsed.saveReference, "ABCDE-23456");
  assert.equal(parsed.recruitNumber, 12);
  const command = canonical(edited);
  if (command?.domain !== "PARTY" || command.action !== "SYNC") assert.fail("complete saved-result envelope must canonicalize");
  assert.deepEqual(command.payload.members, [
    { slotNo: 1, name: "기존", position: null, substitute: false },
    { slotNo: 2, name: "민규", position: null, substitute: false },
    { slotNo: 1, name: "대기/부캐, 메모", position: null, substitute: true },
  ]);
  assert.equal(command.payload.parsedForm?.saveReference, "ABCDE-23456");
});

test("R24 fresh party templates need only a name and retain unknown time explicitly", () => {
  for (const [partyType, title, maximumMembers] of [
    ["PARTY_NUMBER", "5인 파티", 5], ["FLEX_RANK", "자랭", 5], ["OTHER_GAME", "기타게임", 8],
  ] as const) {
    const template = v1StrictPartyTemplate({ recruitNumber: 12, recruitDate: "2026-09-11", id: "party-12", revision: 0, partyType, title, maximumMembers, formCode: "ABCDE-23456" });
    assert.match(template, /^\[파티 #12\] .+ · 0\/\d+명$/mu);
    assert.match(template, /시작: 미정/u);
    assert.doesNotMatch(template, /주최자/u);
    const edited = template.replace(partyType === "FLEX_RANK" ? "TOP.\n" : "1.\n", partyType === "FLEX_RANK" ? "TOP. 민규\n" : "1. 민규\n");
    const command = canonical(edited);
    if (command?.domain !== "PARTY" || command.action !== "SYNC") assert.fail(`${partyType}: one name must be enough`);
    assert.equal(command.payload.members[0]?.name, "민규");
    assert.equal(command.payload.partyType, partyType);
    assert.equal(command.payload.maximumMembers, maximumMembers);
    assert.equal(command.payload.parsedForm?.saveReference, "ABCDE-23456");
  }
});

test("R24 compact party forms cannot fall back to unguarded legacy parsing when the code is removed", () => {
  const detail = v1StrictPartyDetailReply({ ...party, formCode: "ABCDE-23456" }, 12);
  for (const edited of [detail.replace(/^양식코드:.*$/mu, ""), detail.replace("ABCDE-23456", ""), detail.replace("ABCDE-23456", "bad-code")]) {
    const parsed = parsePartyForm(edited);
    assert.notEqual(parsed.decision, "EXACT");
    assert.ok(parsed.diagnostics.some((diagnostic) => diagnostic.code === "INVALID_SAVE_REFERENCE"));
  }
});

test("the full legacy party detail can add a name without changing existing members or its saved identity", () => {
  const detail = v1StrictPartyDetailReply(party, 12);
  assert.match(detail, /^\[K-LOL\.GG 구인상세 #12\]$/mu);
  assert.match(detail, /^#12 · 5인 파티 · 1\/5$/mu);
  assert.match(detail, /^》저장기준 : 2026-09-11 \/ P[a-f0-9]{32}-R4$/mu);
  assert.doesNotMatch(detail, /빠른 추가:|수정: 이 메시지|마감:/u);

  const edited = detail.replace("2.\n", "2. 새이름 @태그 🎮\n");
  const parsed = parsePartyForm(edited);
  assert.equal(parsed.decision, "EXACT");
  assert.equal(parsed.recruitNumber, 12);
  assert.deepEqual(parsed.recruitNumbers, [12, 12]);
  assert.equal(parsed.submittedTitle?.partyType, "PARTY_NUMBER");
  assert.equal(parsed.submittedTitle?.maximumMembers, 5);
  assert.equal(parsed.saveReference, partyCopyReference(party));

  const classification = classifyKakaoV4Command({ profileId: "RECRUIT", text: edited });
  assert.equal(classification.kind, "SNAPSHOT");
  const command = canonical(edited);
  assert.equal(command?.domain, "PARTY");
  assert.equal(command?.action, "SYNC");
  if (command?.domain !== "PARTY" || command.action !== "SYNC") return;
  assert.deepEqual(command.payload.members, [
    { slotNo: 1, name: "기존", position: null, substitute: false },
    { slotNo: 2, name: "새이름 @태그 🎮", position: null, substitute: false },
    { slotNo: 1, name: "대기/부캐, 메모", position: null, substitute: true },
  ]);
  assert.equal(command.payload.startTimeText, "21:00");
  assert.equal(command.payload.gameInfo, "자유랭크");
  assert.equal(command.payload.parsedForm?.saveReference, partyCopyReference(party));
  assert.deepEqual(command.target, { recruitDate: party.recruitDate, recruitNumber: party.recruitNumber });
});

test("copyable forms retain literal metadata, sparse reserve slots, and reserve display names", () => {
  const original = {
    ...party,
    startTimeText: "모바시",
    gameInfo: "자랭 수준 예상 골드",
    organizerText: null,
    reserveCount: 2,
    members: [
      party.members[0]!,
      { name: "예비요정 @태그", position: null, slotNo: 1, substitute: true },
      { name: "세번째/부캐, 메모", position: null, slotNo: 3, substitute: true },
    ],
  };
  const detail = v1StrictPartyDetailReply(original, 12);
  assert.match(detail, /^》시작시간 : 모바시$/mu);
  assert.match(detail, /^》게임정보 : 자랭 수준 예상 골드$/mu);
  assert.match(detail, /^》주최자 : $/mu);
  assert.match(detail, /^예비 1\. 예비요정 @태그\n예비 3\. 세번째\/부캐, 메모\n예비 2\.$/mu);
  const command = canonical(detail);
  if (command?.domain !== "PARTY" || command.action !== "SYNC") assert.fail("copyable detail must remain an exact snapshot");
  assert.deepEqual(command.payload.members, original.members);
  assert.equal(command.payload.startTimeText, original.startTimeText);
  assert.equal(command.payload.gameInfo, original.gameInfo);
  assert.equal(command.payload.organizerText, null);
});

test("resubmitting the current unchanged full form preserves the aggregate and revision", () => {
  const original = { ...party, startTimeText: "9시 30분", gameInfo: "자랭 수준 예상 골드", organizerText: null };
  const now = new Date("2026-09-11T12:00:00.000Z");
  const stored = {
    ...createRecruitParty({ ...original, scheduledStartAt: null, now }),
    revision: original.revision,
  };
  const command = canonical(v1StrictPartyDetailReply(original, 12));
  if (command?.domain !== "PARTY" || command.action !== "SYNC" || !command.payload.parsedForm) assert.fail("expected full form");
  const form = command.payload.parsedForm;
  const updated = syncRecruitParty({
    party: stored,
    expectedRevision: stored.revision,
    members: mergeRecruitPartySlotPatches(stored, form.slots.map((slot) => ({
      slotNo: slot.slotNo, substitute: slot.kind === "RESERVE", state: slot.state, value: slot.value,
    }))),
    startTimeText: command.payload.startTimeText,
    startTimeState: form.startTime.state,
    gameInfo: command.payload.gameInfo,
    gameInfoState: form.gameInfo.state,
    organizerText: command.payload.organizerText,
    organizerState: form.organizer.state,
    scheduledStartAt: stored.scheduledStartAt,
    now: new Date(now.getTime() + 1_000),
  });
  assert.equal(form.saveReference, partyCopyReference(stored));
  assert.equal(updated, stored);
  assert.equal(updated.revision, original.revision);
});

test("line-party copies preserve stored slot names when old position metadata is missing or inconsistent", () => {
  for (const [type, title] of [
    ["FLEX_RANK", "자랭"], ["NORMAL_GAME", "일반"], ["PARTY_RIFT", "협곡파티"],
  ] as const) {
    const original = {
      ...party, type, title, memberCount: 2, reserveCount: 0,
      members: [
        { name: "이전 참가자", position: null, slotNo: 1, substitute: false },
        { name: "두번째 참가자", position: "TOP" as const, slotNo: 2, substitute: false },
      ],
    };
    const detail = v1StrictPartyDetailReply(original, 12);
    assert.match(detail, /^TOP\. 이전 참가자\nJUG\. 두번째 참가자\nMID\.\nADC\.\nSUP\.$/mu);
    const command = canonical(detail);
    if (command?.domain !== "PARTY" || command.action !== "SYNC" || !command.payload.parsedForm) assert.fail(`${type}: expected exact copyable form`);
    assert.deepEqual(command.payload.members.map(({ slotNo, name }) => ({ slotNo, name })), [
      { slotNo: 1, name: "이전 참가자" }, { slotNo: 2, name: "두번째 참가자" },
    ]);
    const stored = createRecruitParty({ ...original, scheduledStartAt: null, now: new Date("2026-09-11T12:00:00.000Z") });
    const merged = mergeRecruitPartySlotPatches(stored, command.payload.parsedForm.slots.map((slot) => ({
      slotNo: slot.slotNo, substitute: slot.kind === "RESERVE", state: slot.state, value: slot.value,
    })));
    assert.deepEqual(merged, stored.members);
    const unchanged = syncRecruitParty({ party: stored, expectedRevision: stored.revision, members: merged, now: new Date("2026-09-11T12:01:00.000Z") });
    assert.equal(unchanged, stored, `${type}: copying the same names must preserve legacy position metadata and revision`);
    const renamed = mergeRecruitPartySlotPatches(stored, [{ slotNo: 1, substitute: false, state: "PRESENT_VALUE", value: "새 참가자" }]);
    assert.deepEqual(renamed[0], { slotNo: 1, name: "새 참가자", position: "TOP", substitute: false });
  }
});

test("metadata mentioning another recruitment title does not become a second form title", () => {
  const original = { ...party, startTimeText: "자랭 구인 마감 후", gameInfo: "자랭 구인", organizerText: "5인 파티 구인 담당" };
  const detail = v1StrictPartyDetailReply(original, 12);
  const parsed = parsePartyForm(detail);
  assert.equal(parsed.decision, "EXACT");
  assert.deepEqual(parsed.diagnostics, []);
  const command = canonical(detail);
  if (command?.domain !== "PARTY" || command.action !== "SYNC") assert.fail("metadata labels must delimit their own values");
  assert.equal(command.payload.startTimeText, original.startTimeText);
  assert.equal(command.payload.gameInfo, original.gameInfo);
  assert.equal(command.payload.organizerText, original.organizerText);
  assert.deepEqual(command.payload.members, party.members);
});

test("custom stored titles remain visible in status while copy forms use the stored party type and capacity", () => {
  for (const [type, title, displayTitle] of [
    ["PARTY_NUMBER", "퇴근 후 배그", "5인 파티"],
    ["FLEX_RANK", "퇴근 후 다섯 명", "자랭"],
    ["ARAM", "주말 증바람 모임", "증바람"],
  ] as const) {
    const original = { ...party, type, title };
    const detail = v1StrictPartyDetailReply(original, 12);
    assert.ok(detail.includes(`#12 · ${displayTitle} · 1/5`));
    assert.ok(v1StrictPartyStatusReply([original]).includes(title));
    const command = canonical(detail);
    if (command?.domain !== "PARTY" || command.action !== "SYNC") assert.fail(`${type}: custom title must remain copyable`);
    assert.equal(command.payload.partyType, type);
    assert.equal(command.payload.maximumMembers, 5);
    assert.deepEqual(command.payload.members.map(({ slotNo, name }) => ({ slotNo, name })), original.members.map(({ slotNo, name }) => ({ slotNo, name })));
    assert.equal(original.title, title);
  }
});

test("detail header and summary identity conflicts are ambiguous and never canonicalize", () => {
  const detail = v1StrictPartyDetailReply(party, 12);
  for (const text of [
    detail.replace("[K-LOL.GG 구인상세 #12]", "[K-LOL.GG 구인상세 #13]"),
    detail.replace("#12 · 5인 파티 · 1/5", "#12 · 5인 파티 · 1/4"),
    detail.replace("#12 · 5인 파티 · 1/5", "#12 · 자랭 · 1/5"),
    detail.replace("#12 · 5인 파티 · 1/5", "#12 · 5인 파티 · 1/5\n#12 · 5인 파티 · 1/5"),
  ]) {
    assert.equal(parsePartyForm(text).decision, "AMBIGUOUS", text);
    assert.equal(canonical(text), null, text);
  }
});

test("out-of-range detail identifiers and capacities are rejected", () => {
  const detail = v1StrictPartyDetailReply(party, 12);
  const invalidNumber = detail
    .replace("[K-LOL.GG 구인상세 #12]", "[K-LOL.GG 구인상세 #1000]")
    .replace("#12 · 5인 파티 · 1/5", "#1000 · 5인 파티 · 1/5");
  assert.equal(parsePartyForm(invalidNumber).decision, "REJECT");
  assert.equal(canonical(invalidNumber), null);

  const invalidCapacity = detail.replace("#12 · 5인 파티 · 1/5", "#12 · 100인 파티 · 1/100");
  assert.equal(parsePartyForm(invalidCapacity).decision, "REJECT");
  assert.equal(canonical(invalidCapacity), null);
});
