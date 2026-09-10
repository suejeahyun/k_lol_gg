import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalRecruitRequestFingerprint,
  createRecruitParty,
  kakaoRecruitDateKey,
  kakaoRecruitTimeText,
  kakaoRoomOwnsRecruitAggregate,
  kakaoSenderControlsRecruitAggregate,
  kakaoRecruitCommandAccess,
  shouldAutoFinishRecruit,
  syncScrimRecruit,
  syncRecruitParty,
  toPublicRecruitPartyDto,
  transitionRecruitParty,
  transitionScrimRecruit,
  type RecruitParty,
  type ScrimRecruit,
} from "../src/modules/recruiting";

const now = new Date("2026-09-07T15:00:00.000Z");

function party(): RecruitParty {
  return createRecruitParty({ id: "party-1", recruitDate: "2026-09-08", resetSequence: 0, recruitNumber: 1, type: "FLEX_RANK", title: "자랭 모집", maximumMembers: 5, now });
}

function scrim(): ScrimRecruit {
  return { id: "scrim-1", revision: 0, sourceRoomId: null, sourceSenderId: null, opponentSenderId: null, recruitDate: "2026-09-08", scrimNumber: 1, tournamentId: "t1", legacyTournamentNumber: null, requesterTeamId: "team-a", opponentTeamId: null, requesterLineup: null, opponentLineup: null, legacyMemo: null, legacySeriesRuleText: null, status: "RECRUITING", scheduledAt: null, bestOf: 3 };
}

test("KST recruit date is stable across the UTC day boundary", () => {
  assert.equal(kakaoRecruitDateKey(new Date("2026-09-07T14:59:59.999Z")), "2026-09-07");
  assert.equal(kakaoRecruitDateKey(new Date("2026-09-07T15:00:00.000Z")), "2026-09-08");
});

test("KST recruit display time is stable across midnight", () => {
  assert.equal(kakaoRecruitTimeText(new Date("2026-09-07T14:59:59.999Z")), "23:59");
  assert.equal(kakaoRecruitTimeText(new Date("2026-09-07T15:00:00.000Z")), "00:00");
});

test("party metadata defaults on the server clock and preserves free text on sync", () => {
  const created = createRecruitParty({
    id: "party-meta", recruitDate: "2026-09-08", resetSequence: 0, recruitNumber: 9,
    type: "FLEX_RANK", title: "자랭 모집", maximumMembers: 5,
    startTimeText: null, gameInfo: "   ", now,
  });
  assert.equal(created.startTimeText, "00:00");
  assert.equal(created.gameInfo, "미입력");

  const preserved = syncRecruitParty({ party: created, expectedRevision: 0, members: [], startTimeText: null, gameInfo: null, now });
  assert.equal(preserved.startTimeText, "00:00");
  assert.equal(preserved.gameInfo, "미입력");

  const populated = syncRecruitParty({
    party: preserved, expectedRevision: 1, members: [], startTimeText: "모이면", gameInfo: "일겜or자랭", now,
  });
  assert.equal(populated.startTimeText, "모이면");
  assert.equal(populated.gameInfo, "일겜or자랭");
  assert.equal(populated.scheduledStartAt, null);
});

test("a Kakao V4 number reservation stays draft until the completed V1 form activates it", () => {
  const reserved = createRecruitParty({
    id: "party-draft", recruitDate: "2026-09-08", resetSequence: 0, recruitNumber: 12,
    type: "PARTY_NUMBER", title: "5인 파티 구인", maximumMembers: 5, initialStatus: "DRAFT", now,
  });
  assert.equal(reserved.status, "DRAFT");
  const submittedAt = new Date("2026-09-07T15:34:00.000Z");
  const activated = syncRecruitParty({
    party: reserved, expectedRevision: 0, now: submittedAt,
    members: [{ name: "재현", position: null, slotNo: 1, substitute: false }],
  });
  assert.equal(activated.status, "IN_PROGRESS");
  assert.equal(activated.members[0]?.name, "재현");
  assert.equal(activated.startTimeText, "00:34");
  assert.equal(activated.gameInfo, "미입력");
});

test("request fingerprint is canonical and binds actor, action, key and body", () => {
  const digest = "a".repeat(64);
  assert.equal(canonicalRecruitRequestFingerprint({ actor: "BOT", action: " create ", requestKey: "request-1", payloadDigestHex: digest }), `BOT:CREATE:request-1:${digest}`);
  assert.throws(() => canonicalRecruitRequestFingerprint({ actor: "BOT", action: "CREATE", requestKey: "r", payloadDigestHex: "bad" }), /INVALID_RECRUIT_PAYLOAD_DIGEST/);
});

test("party sync enforces capacity, positions, slots and optimistic revision", () => {
  const synced = syncRecruitParty({ party: party(), expectedRevision: 0, now, members: [
    { name: "가", position: "TOP", slotNo: 1, substitute: false },
    { name: "나", position: "JGL", slotNo: 2, substitute: false },
  ] });
  assert.equal(synced.revision, 1);
  assert.equal(toPublicRecruitPartyDto(synced).memberCount, 2);
  assert.throws(() => syncRecruitParty({ party: synced, expectedRevision: 0, now, members: [] }), /STALE_RECRUIT_REVISION/);
  assert.throws(() => syncRecruitParty({ party: party(), expectedRevision: 0, now, members: [
    { name: "가", position: "TOP", slotNo: 1, substitute: false },
    { name: "나", position: "TOP", slotNo: 2, substitute: false },
  ] }), /DUPLICATE_RECRUIT_POSITION/);
});

test("Kakao recruit aggregates are visible and mutable only from their signed source room", () => {
  assert.equal(kakaoRoomOwnsRecruitAggregate("room-a", "room-a"), true);
  assert.equal(kakaoRoomOwnsRecruitAggregate("room-a", "room-b"), false);
  assert.equal(kakaoRoomOwnsRecruitAggregate(null, "room-a"), false);
});

test("party primary capacity excludes candidates while the total list remains bounded", () => {
  const members = [
    { name: "가", position: "TOP" as const, slotNo: 1, substitute: false },
    { name: "나", position: null, slotNo: 1, substitute: true },
    { name: "다", position: null, slotNo: 2, substitute: true },
  ];
  const created = createRecruitParty({ id: "party-candidates", recruitDate: "2026-09-08", resetSequence: 0, recruitNumber: 2, type: "FLEX_RANK", title: "후보 보존", maximumMembers: 1, members, now });
  assert.equal(created.members.length, 3);
  assert.equal(toPublicRecruitPartyDto(created).memberCount, 1);
  assert.throws(() => createRecruitParty({ id: "party-over", recruitDate: "2026-09-08", resetSequence: 0, recruitNumber: 3, type: "FLEX_RANK", title: "정원 초과", maximumMembers: 1, members: [...members, { name: "라", position: "MID", slotNo: 2, substitute: false }], now }), /RECRUIT_CAPACITY_EXCEEDED/);
});

test("party terminal transitions do not permit mutation or replay with a new command", () => {
  const finished = transitionRecruitParty({ party: party(), expectedRevision: 0, command: "FINISH", now });
  assert.equal(finished.status, "FINISHED");
  assert.throws(() => transitionRecruitParty({ party: finished, expectedRevision: 1, command: "RESET", now }), /RECRUIT_NOT_MUTABLE/);
});

test("auto finish respects scheduled protection and idle window", () => {
  const base = { ...party(), lastActivityAt: new Date(now.getTime() - 2 * 60 * 60 * 1_000), protectedUntil: new Date(now.getTime() + 1_000) };
  assert.equal(shouldAutoFinishRecruit({ party: base, now, idleMilliseconds: 60 * 60 * 1_000 }), false);
  assert.equal(shouldAutoFinishRecruit({ party: { ...base, protectedUntil: null }, now, idleMilliseconds: 60 * 60 * 1_000 }), true);
});

test("scrim follows recruiting, matched, confirmed and completed states", () => {
  const matched = transitionScrimRecruit({ scrim: scrim(), expectedRevision: 0, command: "JOIN", opponentTeamId: "team-b" });
  const confirmed = transitionScrimRecruit({ scrim: matched, expectedRevision: 1, command: "CONFIRM" });
  const completed = transitionScrimRecruit({ scrim: confirmed, expectedRevision: 2, command: "COMPLETE" });
  assert.equal(completed.status, "COMPLETED");
  assert.throws(() => transitionScrimRecruit({ scrim: completed, expectedRevision: 3, command: "CANCEL" }), /INVALID_SCRIM_TRANSITION/);
});

test("scrim opponent can be reopened but requester cannot join itself", () => {
  assert.throws(() => transitionScrimRecruit({ scrim: scrim(), expectedRevision: 0, command: "JOIN", opponentTeamId: "team-a" }), /SAME_SCRIM_TEAM/);
  const matched = transitionScrimRecruit({ scrim: scrim(), expectedRevision: 0, command: "JOIN", opponentTeamId: "team-b" });
  const reopened = transitionScrimRecruit({ scrim: matched, expectedRevision: 1, command: "REOPEN" });
  assert.equal(reopened.status, "RECRUITING");
  assert.equal(reopened.opponentTeamId, null);
});

test("full scrim sync replaces V1 form fields but binds date, number, tournament and revision", () => {
  const input = {
    scrim: scrim(), expectedRevision: 0, recruitDate: "2026-09-08", scrimNumber: 1,
    tournamentId: "t1", legacyTournamentNumber: null, requesterTeamId: null,
    opponentTeamId: null, legacyTitle: "별빛단 스크림 구인", requesterTeamName: "별빛단",
    opponentTeamName: "달빛단", requesterLineup: { top: "가", jungle: "나", mid: "다", adc: "라", support: "마" },
    opponentLineup: { top: "바", jungle: "사", mid: "아", adc: "자", support: "차" },
    legacyMemo: "즐겁게", legacySeriesRuleText: "5판3선", scheduledAt: new Date("2026-09-08T12:00:00.000Z"), bestOf: 5,
  } as const;
  const synced = syncScrimRecruit(input);
  assert.equal(synced.revision, 1);
  assert.equal(synced.status, "MATCHED");
  assert.equal(synced.requesterTeamName, "별빛단");
  assert.equal(synced.opponentLineup?.support, "차");
  assert.equal(synced.legacyMemo, "즐겁게");
  assert.equal(synced.bestOf, 5);

  const confirmed = { ...synced, revision: 2, status: "CONFIRMED" as const };
  assert.equal(syncScrimRecruit({ ...input, scrim: confirmed, expectedRevision: 2, opponentTeamName: "새달빛단" }).status, "CONFIRMED");
  assert.equal(syncScrimRecruit({ ...input, scrim: confirmed, expectedRevision: 2, opponentTeamName: null, opponentLineup: null }).status, "RECRUITING");
  assert.throws(() => syncScrimRecruit({ ...input, scrim: confirmed, expectedRevision: 1 }), /STALE_RECRUIT_REVISION/);
  assert.throws(() => syncScrimRecruit({ ...input, scrim: confirmed, expectedRevision: 2, scrimNumber: 2 }), /SCRIM_IDENTITY_MISMATCH/);
  assert.throws(() => syncScrimRecruit({ ...input, scrim: { ...confirmed, status: "COMPLETED" }, expectedRevision: 2 }), /INVALID_SCRIM_TRANSITION/);
});

test("public party DTO excludes room, sender, notes and request keys by construction", () => {
  assert.deepEqual(Object.keys(toPublicRecruitPartyDto(party())).sort(), ["gameInfo", "id", "maximumMembers", "memberCount", "recruitNumber", "scheduledStartAt", "startTimeText", "status", "title", "type"]);
});

test("Kakao command access separates public create/read/join from controller lifecycle changes", () => {
  assert.equal(kakaoRecruitCommandAccess("CREATE_PARTY"), "PUBLIC_CREATE");
  assert.equal(kakaoRecruitCommandAccess("CREATE_SCRIM"), "PUBLIC_CREATE");
  assert.equal(kakaoRecruitCommandAccess("GET_PARTY_STATUS"), "PUBLIC_READ");
  assert.equal(kakaoRecruitCommandAccess("JOIN_SCRIM"), "PUBLIC_JOIN");
  for (const type of ["SYNC_PARTY", "FINISH_PARTY", "SYNC_SCRIM", "CONFIRM_SCRIM", "COMPLETE_SCRIM"] as const) {
    assert.equal(kakaoRecruitCommandAccess(type), "OWNER_OR_MANAGER", type);
  }
  for (const type of ["CANCEL_PARTY", "REOPEN_SCRIM", "CANCEL_SCRIM"] as const) assert.equal(kakaoRecruitCommandAccess(type), "ADMIN", type);
  assert.equal(kakaoRecruitCommandAccess("RESET_PARTY"), "DENY");
});

test("V1 room members may update and close shared forms without weakening raw V2", () => {
  for (const type of ["SYNC_PARTY", "FINISH_PARTY", "SYNC_SCRIM"] as const) {
    assert.equal(kakaoRecruitCommandAccess(type, "COMPAT_V1"), "ROOM_MEMBER_MUTATION", type);
    assert.equal(kakaoRecruitCommandAccess(type, "RAW_V2"), "OWNER_OR_MANAGER", type);
  }
  assert.equal(kakaoRecruitCommandAccess("CANCEL_PARTY", "COMPAT_V1"), "ADMIN");
  assert.equal(kakaoRecruitCommandAccess("RESET_PARTY", "COMPAT_V1"), "DENY");
});

test("Kakao creator, joined opponent leader, or trusted operator controls lifecycle commands", () => {
  const base = { sourceSenderId: "sender-creator", opponentSenderId: "sender-opponent", signedSenderId: "sender-other", trustedSender: false };
  assert.equal(kakaoSenderControlsRecruitAggregate({ ...base, signedSenderId: "sender-creator" }), true);
  assert.equal(kakaoSenderControlsRecruitAggregate({ ...base, signedSenderId: "sender-opponent" }), true);
  assert.equal(kakaoSenderControlsRecruitAggregate({ ...base, trustedSender: true }), true);
  assert.equal(kakaoSenderControlsRecruitAggregate(base), false);
  assert.equal(kakaoSenderControlsRecruitAggregate({ ...base, sourceSenderId: null, opponentSenderId: null }), false);
});

test("public scrim join binds the opponent leader and reopen clears that controller", () => {
  const joined = transitionScrimRecruit({
    scrim: scrim(), expectedRevision: 0, command: "JOIN", opponentTeamId: "team-b", opponentSenderId: "sender-opponent",
  });
  assert.equal(joined.opponentSenderId, "sender-opponent");
  const reopened = transitionScrimRecruit({ scrim: joined, expectedRevision: 1, command: "REOPEN" });
  assert.equal(reopened.opponentSenderId, null);
});
