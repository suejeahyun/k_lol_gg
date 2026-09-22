import assert from "node:assert/strict";
import test from "node:test";

import type { JsonObject } from "../src/modules/competitions/core";
import {
  mergePartyCopyAdditions,
  mergePartyCopyEdits,
  partyCopySnapshot,
  readPartyCopySnapshot,
} from "../src/modules/recruiting/application/party-copy-snapshot";
import type { RecruitMember, RecruitParty } from "../src/modules/recruiting/domain/recruiting";

const now = new Date("2026-09-20T12:00:00+09:00");
const member = (name: string, slotNo: number, substitute = false, position: RecruitMember["position"] = null): RecruitMember => ({ name, slotNo, substitute, position });
const party = (changes: Partial<RecruitParty> = {}): RecruitParty => ({
  id: "00000000-0000-4000-8000-000000000024", revision: 2, sourceRoomId: "authorized-scope", sourceSenderId: "synthetic-sender",
  recruitDate: "2026-09-20", resetSequence: 0, recruitNumber: 9, type: "PARTY_NUMBER", status: "IN_PROGRESS", title: "5인 파티",
  maximumMembers: 5, members: [member("서지오", 1), member("민규", 2)], startTimeText: "미정", gameInfo: "배그", organizerText: null,
  scheduledStartAt: null, protectedUntil: null, lastActivityAt: now, ...changes,
});

test("copy snapshot round-trips the original while retaining current authorization and identity context", () => {
  const original = party();
  const snapshot = partyCopySnapshot(original);
  const current = party({ revision: 3, sourceRoomId: "current-authorized-scope", title: "현재 제목", members: [...original.members, member("추가참가자", 3)] });
  const restored = readPartyCopySnapshot({ ...snapshot, sourceRoomId: "untrusted-payload", title: "untrusted-title" }, current);
  assert.equal(restored.revision, 2);
  assert.deepEqual(restored.members, original.members);
  assert.equal(restored.sourceRoomId, current.sourceRoomId);
  assert.equal(restored.title, current.title);
  assert.notEqual(restored.members, original.members);
  assert.notEqual(snapshot.members, original.members);
});

test("concurrent numbered additions keep the latest roster and use the next vacant main slot", () => {
  const base = party();
  const current = party({ revision: 3, members: [...base.members, member("먼저신청", 3)] });
  const submitted = [...base.members, member("동시신청", 3)];
  const beforeBase = structuredClone(base);
  const beforeCurrent = structuredClone(current);
  const beforeSubmitted = structuredClone(submitted);
  assert.deepEqual(mergePartyCopyAdditions(base, current, submitted), [...current.members, member("동시신청", 4)]);
  assert.deepEqual(base, beforeBase);
  assert.deepEqual(current, beforeCurrent);
  assert.deepEqual(submitted, beforeSubmitted);
});

test("a free numbered slot is kept and a replay cannot add the same person twice", () => {
  const base = party();
  const submitted = [...base.members, member("신규참가자", 4)];
  const merged = mergePartyCopyAdditions(base, base, submitted);
  assert.deepEqual(merged, submitted);
  const current = party({ revision: 3, members: merged });
  assert.deepEqual(mergePartyCopyAdditions(base, current, submitted), merged);
});

test("copy forms cannot delete, replace, move or demote an existing original member", () => {
  const base = party();
  const attempts = [
    [base.members[0]!],
    [base.members[0]!, member("다른이름", 2)],
    [base.members[0]!, member("민규", 3)],
    [base.members[0]!, member("민규", 1, true)],
  ];
  for (const submitted of attempts) {
    assert.throws(() => mergePartyCopyAdditions(base, base, submitted), /PARTY_COPY_REMOVAL/);
  }
});

test("a participant removed after the copied original never reappears from a stale form", () => {
  const base = party();
  const current = party({ revision: 3, members: [base.members[0]!] });
  const merged = mergePartyCopyAdditions(base, current, [...base.members, member("신규참가자", 3)]);
  assert.deepEqual(merged, [base.members[0]!, member("신규참가자", 3)]);
  assert.equal(merged.some((row) => row.name === "민규"), false);
});

test("latest slot changes remain intact instead of restoring positions from the original", () => {
  const base = party();
  const current = party({ revision: 3, members: [member("서지오", 1), member("민규", 3)] });
  assert.deepEqual(mergePartyCopyAdditions(base, current, [...base.members, member("신규참가자", 3)]), [...current.members, member("신규참가자", 2)]);
});

test("line-specific collisions reject the submission instead of assigning a different position", () => {
  for (const type of ["FLEX_RANK", "NORMAL_GAME", "PARTY_RIFT"] as const) {
    const base = party({ type, members: [member("탑참가자", 1, false, "TOP")] });
    const current = party({ ...base, revision: 3, members: [...base.members, member("먼저미드", 3, false, "MID")] });
    assert.throws(() => mergePartyCopyAdditions(base, current, [...base.members, member("동시미드", 3, false, "MID")]), /PARTY_COPY_POSITION_TAKEN/);
    assert.deepEqual(mergePartyCopyAdditions(base, current, [...base.members, member("서포터", 5, false, "SUP")]), [...current.members, member("서포터", 5, false, "SUP")]);
  }
});

test("changing an existing line in the copy is treated as replacement, not a new signup", () => {
  const base = party({ type: "FLEX_RANK", members: [member("라인참가자", 3, false, "MID")] });
  assert.throws(() => mergePartyCopyAdditions(base, base, [member("라인참가자", 3, false, "TOP")]), /PARTY_COPY_REMOVAL/);
});

test("full main roster rejects concurrent additions without silently switching them to reserve", () => {
  const base = party({ maximumMembers: 3 });
  const current = party({ ...base, revision: 3, members: [...base.members, member("마지막참가자", 3)] });
  assert.throws(() => mergePartyCopyAdditions(base, current, [...base.members, member("늦은참가자", 3)]), /PARTY_COPY_FULL/);
  assert.equal(current.members.some((row) => row.substitute), false);
  assert.deepEqual(mergePartyCopyAdditions(base, current, [...base.members, member("직접예비신청", 1, true)]), [...current.members, member("직접예비신청", 1, true)]);
});

test("explicit reserves stay reserves and concurrent reserves receive an empty reserve slot", () => {
  const base = party();
  const current = party({ revision: 3, members: [...base.members, member("기존예비", 1, true)] });
  assert.deepEqual(mergePartyCopyAdditions(base, current, [...base.members, member("신규예비", 1, true)]), [...current.members, member("신규예비", 2, true)]);
});

test("a signup already accepted concurrently is recognized by normalized name without moving that member", () => {
  const base = party();
  const current = party({ revision: 3, members: [...base.members, member("Player Name", 5)] });
  assert.deepEqual(mergePartyCopyAdditions(base, current, [...base.members, member("ＰＬＡＹＥＲ   ＮＡＭＥ", 3)]), current.members);
});

test("duplicate names across main and reserve are rejected after Unicode and whitespace normalization", () => {
  const base = party({ members: [] });
  for (const duplicate of ["Player Name", "PLAYER NAME", "Ｐｌａｙｅｒ　Ｎａｍｅ", " Player   Name "]) {
    assert.throws(() => mergePartyCopyAdditions(base, base, [member("Player Name", 1), member(duplicate, 1, true)]), /PARTY_COPY_DUPLICATE_NAME/);
  }
});

test("the total 99-member bound applies even when a reserve slot appears available", () => {
  const base = party({ members: [] });
  const current = party({ members: Array.from({ length: 99 }, (_, index) => member(`예비${index + 1}`, index + 1, true)) });
  assert.throws(() => mergePartyCopyAdditions(base, current, [member("추가예비", 1, true)]), /PARTY_COPY_FULL/);
  assert.throws(() => mergePartyCopyAdditions(base, base, [member("잘못된예비번호", 100, true)]), /PARTY_COPY_FULL/);
});

test("editable copies accept already-applied draft metadata and merge a later signup", () => {
  const base = party({ revision: 0, status: "DRAFT", members: [], startTimeText: "미정", gameInfo: "미정" });
  const current = party({ revision: 1, members: [member("합성주최", 1)], startTimeText: "지금", gameInfo: "합성게임" });
  const result = mergePartyCopyEdits(base, current, { ...current, members: [...current.members, member("합성참가", 2)] });
  assert.deepEqual(result, { members: [...current.members, member("합성참가", 2)], startTimeText: "지금", gameInfo: "합성게임", organizerText: null });
});

test("editable copies delete and replace explicit original slots without collapsing gaps", () => {
  const base = party({ members: [member("합성첫째", 1), member("합성둘째", 3), member("합성예비", 2, true)] });
  const result = mergePartyCopyEdits(base, base, { ...base, members: [member("합성교체", 3)] });
  assert.deepEqual(result.members, [member("합성교체", 3)]);
  assert.deepEqual(mergePartyCopyEdits(base, base, { ...base, members: [] }).members, []);
});

test("editable metadata merges different fields but rejects competing changes atomically", () => {
  const base = party({ startTimeText: "20:00", gameInfo: "합성원본" });
  const current = party({ ...base, revision: 3, startTimeText: "21:00", members: [...base.members, member("합성선착순", 3)] });
  const before = structuredClone(current);
  const merged = mergePartyCopyEdits(base, current, { ...base, gameInfo: "합성변경" });
  assert.equal(merged.startTimeText, "21:00");
  assert.equal(merged.gameInfo, "합성변경");
  assert.deepEqual(merged.members, current.members);
  assert.throws(() => mergePartyCopyEdits(base, current, { ...base, startTimeText: "22:00", members: [] }), /PARTY_COPY_EDIT_CONFLICT/);
  assert.deepEqual(current, before);
});

test("editable copies preserve concurrent members, move reserves and replay the same move", () => {
  const base = party({ members: [member("합성첫째", 1), member("합성예비", 1, true)] });
  const current = party({ ...base, revision: 3, members: [...base.members, member("합성선착순", 3)] });
  const submitted = { ...base, members: [base.members[0]!, member("합성예비", 2)] };
  const merged = mergePartyCopyEdits(base, current, submitted);
  assert.deepEqual(merged.members, [base.members[0]!, member("합성선착순", 3), member("합성예비", 2)]);
  assert.deepEqual(mergePartyCopyEdits(base, { ...current, members: merged.members }, submitted).members, merged.members);
});

test("an editable stale copy cannot resurrect a removed participant by moving them", () => {
  const base = party({ members: [member("합성취소", 1), member("합성유지", 2)] });
  const current = party({ ...base, revision: 3, members: [base.members[1]!] });
  assert.deepEqual(mergePartyCopyEdits(base, current, base).members, current.members);
  for (const members of [[member("합성취소", 3), base.members[1]!], [member("합성취소", 2)]]) {
    assert.throws(() => mergePartyCopyEdits(base, current, { ...base, members }), /PARTY_COPY_EDIT_CONFLICT/);
  }
});

test("editable conflicting replacements reject all changes and preserve concurrent cancellation", () => {
  const base = party({ members: [member("합성원본", 1), member("합성다음", 2)] });
  const current = party({ ...base, revision: 3, members: [member("합성다른교체", 1), base.members[1]!] });
  assert.throws(() => mergePartyCopyEdits(base, current, { ...base, members: [member("합성내교체", 1)] }), /PARTY_COPY_EDIT_CONFLICT/);
  const cancelled = { ...current, members: [base.members[1]!] };
  assert.deepEqual(mergePartyCopyEdits(base, cancelled, { ...base, members: [base.members[1]!] }).members, cancelled.members);
});

test("editable simultaneous additions shift to free slots while explicit moves require their destination", () => {
  const base = party({ members: [member("합성첫째", 1), member("합성예비", 1, true)] });
  const current = party({ ...base, revision: 3, members: [...base.members, member("합성선착순", 2)] });
  assert.deepEqual(mergePartyCopyEdits(base, current, { ...base, members: [...base.members, member("합성동시", 2)] }).members,
    [...current.members, member("합성동시", 3)]);
  assert.throws(() => mergePartyCopyEdits(base, current, { ...base, members: [base.members[0]!, member("합성예비", 2)] }), /PARTY_COPY_EDIT_CONFLICT/);
});

test("editable copies reject duplicate results, capacity overflow and full reserve rosters", () => {
  const base = party({ members: [member("합성첫째", 1)] });
  const current = party({ ...base, revision: 3, members: [...base.members, member("합성선착순", 2)] });
  assert.throws(() => mergePartyCopyEdits(base, current, { ...base, members: [member("합성선착순", 1)] }), /PARTY_COPY_DUPLICATE_NAME/);
  assert.throws(() => mergePartyCopyEdits(base, base, { ...base, members: [...base.members, member("합성첫째", 1, true)] }), /PARTY_COPY_DUPLICATE_NAME/);
  assert.throws(() => mergePartyCopyEdits(base, { ...current, maximumMembers: 2 }, { ...base, members: [...base.members, member("합성동시", 2)] }), /PARTY_COPY_FULL/);
  const empty = party({ members: [] });
  const full = party({ members: Array.from({ length: 99 }, (_, index) => member(`합성예비${index}`, index + 1, true)) });
  assert.throws(() => mergePartyCopyEdits(empty, full, { ...empty, members: [member("합성추가예비", 1, true)] }), /PARTY_COPY_FULL/);
});

test("malformed snapshot envelopes cannot become a merge baseline", async (t) => {
  const current = party();
  const good = partyCopySnapshot(current);
  const cases: Readonly<Record<string, JsonObject | null>> = {
    missing: null,
    "unsupported version": { ...good, version: 2 },
    "different target": { ...good, id: "another-party" },
    "different type": { ...good, type: "FLEX_RANK" },
    "changed capacity": { ...good, maximumMembers: 10 },
    "text revision": { ...good, revision: "2" },
    "fractional revision": { ...good, revision: 1.5 },
    "negative revision": { ...good, revision: -1 },
    "future revision": { ...good, revision: current.revision + 1 },
    "closed original": { ...good, status: "FINISHED" },
    "invalid start": { ...good, startTimeText: null },
    "empty start": { ...good, startTimeText: " " },
    "oversize start": { ...good, startTimeText: "시".repeat(161) },
    "invalid game": { ...good, gameInfo: 1 },
    "empty game": { ...good, gameInfo: " " },
    "oversize game": { ...good, gameInfo: "겜".repeat(501) },
    "invalid organizer": { ...good, organizerText: {} },
    "empty organizer": { ...good, organizerText: " " },
    "non-array members": { ...good, members: {} },
    "non-object member": { ...good, members: [null] },
    "missing member name": { ...good, members: [{ slotNo: 1, substitute: false, position: null }] },
    "empty member name": { ...good, members: [member(" ", 1)] },
    "oversize member name": { ...good, members: [member("가".repeat(81), 1)] },
    "member control character": { ...good, members: [member("합성\u0000회원", 1)] },
    "zero slot": { ...good, members: [member("합성회원", 0)] },
    "negative slot": { ...good, members: [member("합성회원", -1)] },
    "fractional slot": { ...good, members: [member("합성회원", 1.5)] },
    "out-of-capacity slot": { ...good, members: [member("합성회원", 6)] },
    "out-of-range reserve": { ...good, members: [member("합성회원", 100, true)] },
    "invalid substitute": { ...good, members: [{ ...member("합성회원", 1), substitute: "false" }] },
    "invalid position": { ...good, members: [{ ...member("합성회원", 1), position: "UNKNOWN" }] },
    "duplicate slot": { ...good, members: [member("합성회원1", 1), member("합성회원2", 1)] },
    "duplicate name": { ...good, members: [member("합성회원", 1), member("합성회원", 2)] },
    "duplicate normalized name": { ...good, members: [member("Player Name", 1), member("ＰＬＡＹＥＲ  ＮＡＭＥ", 2)] },
    "duplicate position": { ...good, members: [member("합성회원1", 1, false, "MID"), member("합성회원2", 2, false, "MID")] },
    "too many members": { ...good, members: Array.from({ length: 100 }, (_, index) => member(`합성예비${index}`, index + 1, true)) },
  };
  for (const [label, state] of Object.entries(cases)) {
    await t.test(label, () => assert.throws(() => readPartyCopySnapshot(state, current), /PARTY_COPY_CONFLICT/));
  }
});

test("a reused empty draft cannot cancel a later join, but the returned current form can", () => {
  const base = party({ revision: 0, status: "DRAFT", members: [], startTimeText: "미정", gameInfo: "미정" });
  const current = party({ revision: 3, startTimeText: "모이면", gameInfo: "합성게임", members: [member("합성첫째", 1), member("합성둘째", 2), member("합성셋째", 3)] });
  const attempt = { ...current, members: current.members.slice(0, 2) };
  assert.deepEqual(mergePartyCopyEdits(base, current, attempt).members, current.members);
  assert.deepEqual(mergePartyCopyEdits(current, current, attempt).members, attempt.members);
});
