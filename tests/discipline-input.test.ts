import assert from "node:assert/strict";
import test from "node:test";

import { parseCancelDisciplineRecord, parseCreateDisciplineRecord, parseDisciplineReview, parseUpdateDisciplineRecord } from "../src/modules/discipline/infrastructure/discipline-input";

test("discipline admin input parsers keep a closed field allowlist", () => {
  assert.deepEqual(parseCreateDisciplineRecord({ userAccountId: null, playerId: null, targetName: "대상", targetNickname: null, targetTagLine: null, type: "WARNING", category: "GENERAL", source: "신고", reason: "사유", internalNote: null }), { userAccountId: null, playerId: null, targetName: "대상", targetNickname: null, targetTagLine: null, type: "WARNING", category: "GENERAL", source: "신고", reason: "사유", internalNote: null });
  assert.equal(parseCreateDisciplineRecord({ targetName: "대상", type: "WARNING", category: "GENERAL", source: "신고", reason: "사유", storageKey: "leak" }), null);
  assert.equal(parseUpdateDisciplineRecord({ reason: "변경", internalNote: null, active: false }), null);
});

test("review and cancellation bodies reject ambiguous shapes", () => {
  assert.deepEqual(parseDisciplineReview({ decision: "REJECT", reviewNote: "다시 제출" }), { decision: "REJECT", reviewNote: "다시 제출" });
  assert.equal(parseDisciplineReview({ decision: "RESET", reviewNote: "" }), null);
  assert.deepEqual(parseCancelDisciplineRecord({ reason: "오등록" }), { reason: "오등록" });
  assert.equal(parseCancelDisciplineRecord({ reason: "오등록", hardDelete: true }), null);
});
