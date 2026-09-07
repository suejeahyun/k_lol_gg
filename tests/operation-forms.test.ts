import assert from "node:assert/strict";
import test from "node:test";

import {
  OperationFormError, parseOperationFormPayload, reviewOperationForm,
  softDeleteOperationForm, toAdminOperationFormDto, type OperationForm,
} from "../src/modules/recruiting/operation-forms/domain";

const now = new Date("2026-09-07T01:00:00.000Z");
const base: OperationForm<"suggestions"> = Object.freeze({
  id: "0199a288-15d9-7ae6-9d50-2fa0b1a94444", revision: 0, formType: "suggestions", status: "PENDING",
  payload: { applicantName: "신청자", applicantNickname: "소환사", reason: "운영 개선", content: "건의 내용입니다." },
  submittedAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z", adminNote: null,
  reviewedByUserAccountId: null, reviewedAt: null, deletedAt: null, deletedByUserAccountId: null, deletionReason: null,
});

test("operation form payloads accept only their bounded allowlist", () => {
  assert.deepEqual(parseOperationFormPayload("friends", {
    applicantName: " 신청자 ", applicantNickname: "닉네임", friendName: "친구", friendNickname: "친구닉",
    usagePeriod: "2026 시즌", discordNicknameChange: true,
  }), { applicantName: "신청자", applicantNickname: "닉네임", friendName: "친구", friendNickname: "친구닉", usagePeriod: "2026 시즌", discordNicknameChange: true });
  assert.throws(() => parseOperationFormPayload("friends", {
    applicantName: "신청자", applicantNickname: "닉네임", friendName: "친구", friendNickname: "친구닉",
    usagePeriod: "2026 시즌", discordNicknameChange: true, internalMemo: "노출 금지",
  }), (error) => error instanceof OperationFormError && error.code === "INVALID_FORM_PAYLOAD");
  assert.throws(() => parseOperationFormPayload("leaves", {
    applicantName: "신청자", applicantNickname: "닉네임", periodStart: "2026-09-08", periodEnd: "2026-09-07", reason: "사유", scope: "전체",
  }), (error) => error instanceof OperationFormError && error.code === "INVALID_FORM_PAYLOAD");
  assert.throws(() => parseOperationFormPayload("meetups", {
    hostName: "주최자", hostNickname: "닉", meetupAt: "2026-09-07T18:00:00+09:00", location: "서울", participants: ["중복", "중복"],
  }), (error) => error instanceof OperationFormError && error.code === "INVALID_FORM_PAYLOAD");
});

test("review transitions are monotonic and revision checked", () => {
  const reviewing = reviewOperationForm({ form: base, expectedRevision: 0, status: "IN_REVIEW", adminNote: " 확인 중 ", reviewerUserAccountId: "admin", now });
  assert.equal(reviewing.revision, 1); assert.equal(reviewing.adminNote, "확인 중");
  const completed = reviewOperationForm({ form: reviewing, expectedRevision: 1, status: "COMPLETED", reviewerUserAccountId: "admin", now: new Date(now.getTime() + 1_000) });
  assert.throws(() => reviewOperationForm({ form: completed, expectedRevision: 2, status: "IN_REVIEW", reviewerUserAccountId: "admin", now }), (error) => error instanceof OperationFormError && error.code === "INVALID_FORM_TRANSITION");
  assert.throws(() => reviewOperationForm({ form: base, expectedRevision: 9, reviewerUserAccountId: "admin", now }), (error) => error instanceof OperationFormError && error.code === "STALE_FORM_REVISION");
});

test("delete is soft and the admin DTO excludes source, reviewer identity, and deletion metadata", () => {
  const deleted = softDeleteOperationForm({ form: base, expectedRevision: 0, reason: "중복 접수", deletedByUserAccountId: "admin", now });
  assert.equal(deleted.deletedAt, now.toISOString()); assert.equal(deleted.revision, 1);
  const dto = toAdminOperationFormDto(base) as unknown as Record<string, unknown>;
  assert.deepEqual(Object.keys(dto).sort(), ["adminNote", "formType", "id", "payload", "reviewedAt", "revision", "status", "submittedAt", "updatedAt"].sort());
  assert.equal("sourceRoomId" in dto, false); assert.equal("deletedByUserAccountId" in dto, false);
});
