import assert from "node:assert/strict";
import test from "node:test";

import { parseAdminAccountQuery } from "../src/modules/accounts/application/parse-admin-account-query";
import { ACCOUNT_CONFLICT_PROBLEM_BY_REASON } from "../src/modules/accounts/application/account-http-problems";
import {
  beginRecoveryResponseWindow,
  finishRecoveryResponseWindow,
  RECOVERY_RESPONSE_MINIMUM_MS,
} from "../src/modules/accounts/application/recovery-response-timing";
import {
  normalizeLoginId,
  ACCOUNT_CONFLICT_REASONS,
  parseAccountApprovalInput,
  parseAccountReasonInput,
  parseConfirmedAccountReasonInput,
  parseInternalReasonInput,
  parsePasswordChangeInput,
  parseOwnPlayerInput,
  parseSignupInput,
  parseRoleChangeInput,
  parseUserLoginInput,
} from "../src/modules/accounts/domain/account-contracts";
import {
  hashPassword,
  identifyPasswordHash,
  verifyPasswordHashConstantWork,
} from "../src/modules/auth/infrastructure/node-password";
import {
  formatKoreanDateTime,
  formatOptionalKoreanDateTime,
} from "../src/platform/time/format-korean-date-time";
import {
  advanceOneTimeSecretEpoch,
  canPresentOneTimeSecret,
  shouldRestoreOneTimeSecretPage,
} from "../src/platform/security/one-time-secret-lifecycle";

const validSignup = {
  loginId: "Cloud.User",
  password: "살랑바람2026safe",
  memberName: "하늘 회원",
  riotId: "Breeze#KR1",
  termsAccepted: true,
  privacyAccepted: true,
};

test("KST date-time formatting is deterministic and never uses AM/PM", () => {
  assert.equal(formatKoreanDateTime("2026-09-01T15:00:00.000Z"), "2026. 9. 2. 00:00");
  assert.equal(formatKoreanDateTime(new Date("2026-09-01T00:05:00.000Z")), "2026. 9. 1. 09:05");
  assert.equal(formatKoreanDateTime("not-a-date"), "기록 없음");
  assert.equal(formatOptionalKoreanDateTime(null), "기록 없음");
  assert.doesNotMatch(formatKoreanDateTime("2026-09-01T15:00:00.000Z"), /AM|PM|오전|오후/);
});

test("one-time secret response is discarded after any hidden-page boundary", () => {
  const requestEpoch = 4;
  const hiddenEpoch = advanceOneTimeSecretEpoch(requestEpoch);

  assert.equal(canPresentOneTimeSecret({
    requestEpoch,
    currentEpoch: requestEpoch,
    visibilityState: "visible",
  }), true);
  assert.equal(canPresentOneTimeSecret({
    requestEpoch,
    currentEpoch: hiddenEpoch,
    visibilityState: "hidden",
  }), false);
  assert.equal(canPresentOneTimeSecret({
    requestEpoch,
    currentEpoch: hiddenEpoch,
    visibilityState: "visible",
  }), false);
});

test("initial pageshow does not invalidate a request, while history restoration does", () => {
  assert.equal(shouldRestoreOneTimeSecretPage({
    persisted: false,
    pageHiddenSinceMount: false,
    cleanupPending: false,
  }), false);
  assert.equal(shouldRestoreOneTimeSecretPage({
    persisted: true,
    pageHiddenSinceMount: false,
    cleanupPending: false,
  }), true);
  assert.equal(shouldRestoreOneTimeSecretPage({
    persisted: false,
    pageHiddenSinceMount: true,
    cleanupPending: false,
  }), true);
  assert.equal(shouldRestoreOneTimeSecretPage({
    persisted: false,
    pageHiddenSinceMount: false,
    cleanupPending: true,
  }), true);
});

test("every account conflict reason has an explicit safe actionable HTTP problem", () => {
  assert.deepEqual(
    Object.keys(ACCOUNT_CONFLICT_PROBLEM_BY_REASON).sort(),
    [...ACCOUNT_CONFLICT_REASONS].sort(),
  );
  for (const reason of ACCOUNT_CONFLICT_REASONS) {
    const problem = ACCOUNT_CONFLICT_PROBLEM_BY_REASON[reason];
    assert.equal(problem.status, 409);
    assert.notEqual(problem.code, "ACCOUNT_CONFLICT");
    assert.ok(problem.detail.length > 0);
  }
});

test("recovery response timing applies the same bounded floor with injectable time", async () => {
  let currentTime = 1_000;
  const sleeps: number[] = [];
  const dependencies = {
    now: () => currentTime,
    sleep: async (milliseconds: number) => {
      sleeps.push(milliseconds);
      currentTime += milliseconds;
    },
    jitter: () => 17,
  };
  const window = beginRecoveryResponseWindow(dependencies);
  assert.equal(window.targetDurationMs, RECOVERY_RESPONSE_MINIMUM_MS + 17);
  currentTime += 42;
  await finishRecoveryResponseWindow(window, dependencies);
  assert.deepEqual(sleeps, [RECOVERY_RESPONSE_MINIMUM_MS + 17 - 42]);

  const alreadySlow = beginRecoveryResponseWindow(dependencies);
  currentTime += alreadySlow.targetDurationMs + 1;
  await finishRecoveryResponseWindow(alreadySlow, dependencies);
  assert.equal(sleeps.length, 1);
});

test("signup is an exact agreement-bound contract with NFKC lowercase identities", () => {
  const parsed = parseSignupInput(validSignup);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.loginIdNormalized, "cloud.user");
  assert.equal(parsed.value.nicknameNormalized, "breeze");
  assert.equal(parsed.value.tagLineNormalized, "kr1");
  assert.equal(normalizeLoginId("  ＣＬＯＵＤ.User  "), "cloud.user");

  assert.equal(parseSignupInput({ ...validSignup, termsAccepted: false }).ok, false);
  assert.equal(parseSignupInput({ ...validSignup, privacyAccepted: false }).ok, false);
  assert.equal(parseSignupInput({ ...validSignup, role: "ADMIN" }).ok, false);
  assert.equal(parseSignupInput({ ...validSignup, loginId: "bad id" }).ok, false);
  assert.equal(parseSignupInput({ ...validSignup, riotId: "missing-tag" }).ok, false);
  assert.equal(parseSignupInput({ ...validSignup, riotId: `${"a".repeat(17)}#KR1` }).ok, false);
  assert.equal(parseSignupInput({ ...validSignup, riotId: "Breeze#TOOLNG" }).ok, false);
  for (const control of [
    "\u061c",
    "\u200b",
    "\u200c",
    "\u200d",
    "\u200e",
    "\u200f",
    "\u2060",
    "\u0085",
    "\u202e",
    "\u2067",
    "\ufeff",
    "\ufe0f",
    "\u{e0100}",
  ]) {
    assert.equal(parseSignupInput({ ...validSignup, loginId: `cloud${control}user` }).ok, false);
    assert.equal(parseSignupInput({ ...validSignup, memberName: `하늘${control}회원` }).ok, false);
    assert.equal(parseSignupInput({ ...validSignup, riotId: `Breeze${control}#KR1` }).ok, false);
  }
  assert.equal(parseSignupInput({
    ...validSignup,
    memberName: `하늘${String.fromCharCode(0xd800)}회원`,
  }).ok, false);
  assert.equal(parseSignupInput({
    ...validSignup,
    riotId: `Breeze${String.fromCharCode(0xdc00)}#KR1`,
  }).ok, false);
  assert.equal(parseSignupInput({ ...validSignup, memberName: "하늘😀회원" }).ok, true);
});

test("login and password change reject extra keys, controls, reuse, and weak passwords", () => {
  assert.equal(parseUserLoginInput({ loginId: "cloud.user", password: "x" }).ok, true);
  assert.equal(parseUserLoginInput({ loginId: "cloud.user", password: "x", role: "ADMIN" }).ok, false);
  assert.equal(parseUserLoginInput({ loginId: "cloud\u0000user", password: "x" }).ok, false);
  assert.equal(parseUserLoginInput({ loginId: "cloud\u061cuser", password: "x" }).ok, false);
  assert.equal(parseUserLoginInput({ loginId: "cloud.user", password: "x\u200e" }).ok, false);
  assert.equal(parsePasswordChangeInput({
    currentPassword: "old-password-2026",
    newPassword: "새비밀번호2026safe",
  }).ok, true);
  assert.equal(parsePasswordChangeInput({
    currentPassword: "same-password-2026",
    newPassword: "same-password-2026",
  }).ok, false);
  assert.equal(parsePasswordChangeInput({
    currentPassword: "old-password-2026",
    newPassword: "onlyletters",
  }).ok, false);
  assert.equal(parsePasswordChangeInput({
    currentPassword: "old\u200f-password-2026",
    newPassword: "새비밀번호2026safe",
  }).ok, false);
});

test("own player edit accepts only Riot ID and supported tier fields", () => {
  const parsed = parseOwnPlayerInput({
    riotId: "Breeze#KR1",
    currentTier: "골드 2",
    peakTier: "플래티넘 4",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.value, {
      nickname: "Breeze",
      tagLine: "KR1",
      currentTier: "골드 2",
      peakTier: "플래티넘 4",
    });
  }
  assert.equal(parseOwnPlayerInput({ riotId: "태그없음", currentTier: null, peakTier: null }).ok, false);
  assert.equal(parseOwnPlayerInput({ riotId: `${"a".repeat(17)}#KR1`, currentTier: null, peakTier: null }).ok, false);
  assert.equal(parseOwnPlayerInput({ riotId: "Breeze#TOOLNG", currentTier: null, peakTier: null }).ok, false);
  assert.equal(parseOwnPlayerInput({ riotId: "Breeze#KR1", currentTier: "신화 1", peakTier: null }).ok, false);
  assert.equal(parseOwnPlayerInput({ riotId: "Breeze#KR1", currentTier: null, peakTier: null, status: "ACTIVE" }).ok, false);
});

test("claim approval requires an exact explicit manual-review acknowledgement shape", () => {
  const claimId = "4ff71f34-2557-4a33-a718-b461635e4dbe";
  assert.equal(parseAccountApprovalInput({
    publicReason: "승인되었습니다.",
    internalReason: "가입 입력과 기존 플레이어를 수동 대조함",
    expectedClaimId: claimId,
    claimOwnershipReviewed: true,
  }).ok, true);
  assert.equal(parseAccountApprovalInput({
    publicReason: "승인되었습니다.",
    internalReason: "신규 연결 플레이어 승인",
    expectedClaimId: null,
    claimOwnershipReviewed: false,
  }).ok, true);
  assert.equal(parseAccountApprovalInput({
    publicReason: null,
    internalReason: "누락",
    expectedClaimId: claimId,
  }).ok, false);
  assert.equal(parseAccountReasonInput({
    publicReason: null,
    internalReason: "일반 상태 변경",
    expectedClaimId: null,
  }).ok, false);
  assert.equal(parseAccountReasonInput({
    publicReason: "승인\u061c안내",
    internalReason: "수동 검토 완료",
  }).ok, false);
  assert.equal(parseAccountReasonInput({
    publicReason: null,
    internalReason: "검토\u200e완료",
  }).ok, false);
});

test("sensitive administrator mutations require an exact typed target login id", () => {
  assert.equal(parseConfirmedAccountReasonInput({
    publicReason: null,
    internalReason: "상태 변경 사유",
    confirmLoginId: "Cloud.User",
  }).ok, true);
  assert.equal(parseConfirmedAccountReasonInput({
    publicReason: null,
    internalReason: "상태 변경 사유",
  }).ok, false);
  assert.equal(parseRoleChangeInput({
    role: "ADMIN",
    internalReason: "승격 사유",
    confirmLoginId: "Cloud.User",
  }).ok, true);
  assert.equal(parseRoleChangeInput({ role: "ADMIN", internalReason: "승격 사유" }).ok, false);
  assert.equal(parseInternalReasonInput({
    internalReason: "복구 사유",
    confirmLoginId: "Cloud.User",
  }).ok, true);
  assert.equal(parseInternalReasonInput({
    internalReason: "복구 사유",
    confirmLoginId: "Cloud\u200f.User",
  }).ok, false);
});

test("admin account list query is canonical, bounded, and rejects duplicates or controls", () => {
  const parsed = parseAdminAccountQuery(new URLSearchParams(
    "q=Nickname%23KR1&status=PENDING&role=USER&deleted=ACTIVE&page=2&pageSize=50",
  ));
  assert.equal(parsed.ok, true);
  assert.equal(parseAdminAccountQuery(new URLSearchParams("q=a&q=b")).ok, false);
  assert.equal(parseAdminAccountQuery(new URLSearchParams("unknown=x")).ok, false);
  assert.equal(parseAdminAccountQuery(new URLSearchParams("q=bad%00query")).ok, false);
  assert.equal(parseAdminAccountQuery(new URLSearchParams("q=bad%E2%80%8Equery")).ok, false);
  assert.equal(parseAdminAccountQuery(new URLSearchParams("q=bad%C2%85query")).ok, false);
  assert.equal(parseAdminAccountQuery(new URLSearchParams("page=0")).ok, false);
  assert.equal(parseAdminAccountQuery(new URLSearchParams("pageSize=100")).ok, false);
});

test("password verification identifies legacy bcrypt and new scrypt with dummy work for unusable hashes", async () => {
  const scryptHash = await hashPassword("safe-password-2026");
  assert.equal(identifyPasswordHash(scryptHash), "SCRYPT");
  assert.deepEqual(
    await verifyPasswordHashConstantWork("safe-password-2026", scryptHash),
    { format: "SCRYPT", matches: true },
  );
  assert.deepEqual(
    await verifyPasswordHashConstantWork("safe-password-2026", null),
    { format: "UNKNOWN", matches: false },
  );
  assert.deepEqual(
    await verifyPasswordHashConstantWork("safe-password-2026", "not-a-password-hash"),
    { format: "UNKNOWN", matches: false },
  );
});
