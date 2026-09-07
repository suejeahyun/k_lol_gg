import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublicDisciplineStatistics,
  currentEvidence,
  disciplineIdentityKey,
  disciplineResolutionDueAt,
  planBanReview,
  planCautionConversion,
  requiredResolutionGameCount,
  reviewDisciplineEvidence,
  submitDisciplineEvidence,
  type ActiveDisciplineRecord,
  type DisciplineTask,
} from "../src/modules/discipline";

const DAY = 24 * 60 * 60 * 1_000;
const issuedAt = new Date("2026-09-01T00:00:00.000Z");

function record(id: string, type: "CAUTION" | "WARNING" | "BAN", day: number): ActiveDisciplineRecord {
  return { id, identityKey: "player:p1", type, active: true, createdAt: new Date(issuedAt.getTime() + day * DAY), convertedToWarningId: null };
}

function task(requiredGameCount = 2): DisciplineTask {
  return {
    id: "task-1",
    revision: 0,
    ownerAccountId: "account-1",
    ownerPlayerId: "player-1",
    requiredGameCount,
    dueAt: new Date(issuedAt.getTime() + 30 * DAY),
    status: "REQUIRED",
    reviewBoundaryAt: null,
    evidence: [],
  };
}

function evidence(id: string, digit: string, submittedAt: Date) {
  return { id, sha256Hex: digit.repeat(64), submittedAt, supersededAt: null };
}

test("identity prioritizes account then player and normalizes direct identity", () => {
  assert.equal(disciplineIdentityKey({ userAccountId: "a1", playerId: "p1", directName: null, directNickname: null, directTagLine: null }), "account:a1");
  assert.equal(disciplineIdentityKey({ userAccountId: null, playerId: "p1", directName: null, directNickname: null, directTagLine: null }), "player:p1");
  assert.equal(disciplineIdentityKey({ userAccountId: null, playerId: null, directName: "  홍 길동 ", directNickname: " TeSt ", directTagLine: " KR1 " }), "direct:홍 길동|test|kr1");
});

test("warning policy preserves V1 counts and deterministic oldest-first conversion", () => {
  assert.equal(requiredResolutionGameCount("GENERAL"), 10);
  assert.equal(requiredResolutionGameCount("INHOUSE"), 15);
  assert.equal(disciplineResolutionDueAt(issuedAt).getTime(), issuedAt.getTime() + 30 * DAY);
  const records = [record("c3", "CAUTION", 3), record("c1", "CAUTION", 1), record("c2", "CAUTION", 2), record("c4", "CAUTION", 4)];
  assert.deepEqual(planCautionConversion(records, "player:p1"), { cautionRecordIds: ["c1", "c2", "c3"] });
  assert.equal(planCautionConversion(records.slice(0, 2), "player:p1"), null);
});

test("three active warnings create one review and an existing pending review suppresses duplicates", () => {
  const records = [record("w2", "WARNING", 2), record("w1", "WARNING", 1), record("w3", "WARNING", 3)];
  assert.deepEqual(planBanReview(records, "player:p1", false), { warningRecordIds: ["w1", "w2", "w3"] });
  assert.equal(planBanReview(records, "player:p1", true), null);
});

test("owner evidence submission reaches review only at the exact required count", () => {
  const first = submitDisciplineEvidence({ task: task(), expectedRevision: 0, accountId: "account-1", playerId: null, evidence: evidence("e1", "a", issuedAt), now: issuedAt });
  assert.equal(first.status, "AWAITING_UPLOAD");
  assert.equal(first.revision, 1);
  const secondAt = new Date(issuedAt.getTime() + 1);
  const second = submitDisciplineEvidence({ task: first, expectedRevision: 1, accountId: "account-1", playerId: null, evidence: evidence("e2", "b", secondAt), now: secondAt });
  assert.equal(second.status, "PENDING_REVIEW");
  assert.equal(currentEvidence(second).length, 2);
  const approved = reviewDisciplineEvidence({ task: second, expectedRevision: 2, decision: "APPROVE", reviewNote: "", now: issuedAt });
  assert.equal(approved.status, "APPROVED");
});

test("rejection creates a batch boundary and requires a complete fresh batch", () => {
  const full = { ...task(1), status: "PENDING_REVIEW" as const, evidence: [evidence("old", "a", issuedAt)] };
  const rejected = reviewDisciplineEvidence({ task: full, expectedRevision: 0, decision: "REJECT", reviewNote: "사진 확인 불가", now: new Date(issuedAt.getTime() + 1) });
  assert.equal(currentEvidence(rejected).length, 0);
  const retried = submitDisciplineEvidence({ task: rejected, expectedRevision: 1, accountId: "account-1", playerId: null, evidence: evidence("new", "b", new Date(issuedAt.getTime() + 2)), now: new Date(issuedAt.getTime() + 2) });
  assert.equal(retried.status, "PENDING_REVIEW");
  assert.equal(currentEvidence(retried).length, 1);
});

test("stale, non-owner, duplicate, expired and invalid review operations fail closed", () => {
  assert.throws(() => submitDisciplineEvidence({ task: task(), expectedRevision: 1, accountId: "account-1", playerId: null, evidence: evidence("e", "a", issuedAt), now: issuedAt }), /STALE_TASK_REVISION/);
  assert.throws(() => submitDisciplineEvidence({ task: task(), expectedRevision: 0, accountId: "other", playerId: null, evidence: evidence("e", "a", issuedAt), now: issuedAt }), /DISCIPLINE_TASK_NOT_FOUND/);
  assert.throws(() => submitDisciplineEvidence({ task: task(), expectedRevision: 0, accountId: "account-1", playerId: null, evidence: evidence("e", "a", issuedAt), now: new Date(issuedAt.getTime() + 31 * DAY) }), /DISCIPLINE_TASK_EXPIRED/);
  const withEvidence = { ...task(), evidence: [evidence("old", "a", issuedAt)] };
  assert.throws(() => submitDisciplineEvidence({ task: withEvidence, expectedRevision: 0, accountId: "account-1", playerId: null, evidence: evidence("new", "a", issuedAt), now: issuedAt }), /DUPLICATE_DISCIPLINE_EVIDENCE/);
  assert.throws(() => reviewDisciplineEvidence({ task: { ...task(), status: "PENDING_REVIEW" }, expectedRevision: 0, decision: "REJECT", reviewNote: "", now: issuedAt }), /DISCIPLINE_REVIEW_NOTE_REQUIRED/);
  assert.throws(() => submitDisciplineEvidence({ task: task(0), expectedRevision: 0, accountId: "account-1", playerId: null, evidence: evidence("e", "a", issuedAt), now: issuedAt }), /INVALID_DISCIPLINE_REQUIRED_COUNT/);
  assert.throws(() => submitDisciplineEvidence({ task: task(), expectedRevision: 0, accountId: "account-1", playerId: null, evidence: evidence("e", "a", new Date(issuedAt.getTime() + 1)), now: issuedAt }), /INVALID_DISCIPLINE_EVIDENCE/);
});

test("public discipline DTO contains aggregate counts only", () => {
  const dto = buildPublicDisciplineStatistics([
    { id: "private-a", type: "CAUTION", active: true, createdAt: issuedAt },
    { id: "private-b", type: "WARNING", active: false, createdAt: new Date(issuedAt.getTime() + DAY) },
    { id: "private-c", type: "BAN", active: true, createdAt: new Date(issuedAt.getTime() + 2 * DAY) },
  ]);
  assert.deepEqual(Object.keys(dto).sort(), ["activeBanCount", "activeCautionCount", "activeWarningCount", "resolvedCount", "updatedAt"]);
  assert.deepEqual(dto, { activeCautionCount: 1, activeWarningCount: 0, activeBanCount: 1, resolvedCount: 1, updatedAt: "2026-09-03T00:00:00.000Z" });
  assert.equal(JSON.stringify(dto).includes("private-"), false);
});
