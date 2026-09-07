import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalRecruitRequestFingerprint,
  createRecruitParty,
  kakaoRecruitDateKey,
  shouldAutoFinishRecruit,
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
  return { id: "scrim-1", revision: 0, recruitDate: "2026-09-08", scrimNumber: 1, tournamentId: "t1", requesterTeamId: "team-a", opponentTeamId: null, status: "RECRUITING", scheduledAt: null, bestOf: 3 };
}

test("KST recruit date is stable across the UTC day boundary", () => {
  assert.equal(kakaoRecruitDateKey(new Date("2026-09-07T14:59:59.999Z")), "2026-09-07");
  assert.equal(kakaoRecruitDateKey(new Date("2026-09-07T15:00:00.000Z")), "2026-09-08");
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

test("public party DTO excludes room, sender, notes and request keys by construction", () => {
  assert.deepEqual(Object.keys(toPublicRecruitPartyDto(party())).sort(), ["id", "maximumMembers", "memberCount", "recruitNumber", "scheduledStartAt", "status", "title", "type"]);
});
