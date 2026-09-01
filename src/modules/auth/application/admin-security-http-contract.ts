import { definePublicProblem } from "@/platform/http/problem";

export const ADMIN_SECURITY_PROBLEMS = Object.freeze({
  accountNotEligible: definePublicProblem({
    code: "ADMIN_ACCOUNT_NOT_ELIGIBLE",
    status: 403,
    title: "이 계정에서는 보안 설정을 변경할 수 없습니다.",
    detail: "승인된 관리자 계정으로 다시 로그인해 주세요.",
  }),
  adminRequired: definePublicProblem({
    code: "ADMIN_ROLE_REQUIRED",
    status: 403,
    title: "관리자 권한이 필요합니다.",
    detail: "승인된 관리자 계정으로 로그인해 주세요.",
  }),
  alreadyEnabled: definePublicProblem({
    code: "TOTP_ALREADY_ENABLED",
    status: 409,
    title: "2단계 인증이 이미 활성화되어 있습니다.",
    detail: "현재 설정을 해제한 뒤 새로 등록해 주세요.",
  }),
  invalidCode: definePublicProblem({
    code: "TOTP_CODE_INVALID",
    status: 403,
    title: "인증 앱 코드가 올바르지 않습니다.",
    detail: "인증 앱의 현재 6자리 코드를 확인해 주세요.",
  }),
  invalidPayload: definePublicProblem({
    code: "TOTP_REQUEST_INVALID",
    status: 400,
    title: "2단계 인증 요청 값이 올바르지 않습니다.",
    detail: "요청 형식과 6자리 인증 코드를 확인해 주세요.",
  }),
  originRequired: definePublicProblem({
    code: "SAME_ORIGIN_REQUIRED",
    status: 403,
    title: "허용되지 않은 요청 출처입니다.",
    detail: "현재 K-LOL.GG 페이지에서 다시 시도해 주세요.",
  }),
  pendingSetupExists: definePublicProblem({
    code: "TOTP_SETUP_PENDING",
    status: 409,
    title: "진행 중인 2단계 인증 등록이 있습니다.",
    detail: "기존 등록 키를 잃었다면 등록 시도를 취소한 뒤 다시 시작해 주세요.",
  }),
  replayedCode: definePublicProblem({
    code: "TOTP_CODE_REPLAYED",
    status: 409,
    title: "이미 사용한 인증 앱 코드입니다.",
    detail: "인증 앱에 새 코드가 표시된 뒤 다시 시도해 주세요.",
  }),
  sessionRequired: definePublicProblem({
    code: "ADMIN_SESSION_REQUIRED",
    status: 401,
    title: "관리자 로그인이 필요합니다.",
    detail: "관리자 계정으로 로그인한 뒤 다시 시도해 주세요.",
  }),
  setupRequired: definePublicProblem({
    code: "TOTP_SETUP_REQUIRED",
    status: 409,
    title: "2단계 인증 등록을 먼저 시작해야 합니다.",
    detail: "새 등록 키를 만든 뒤 인증 앱 코드로 활성화해 주세요.",
  }),
  stateChanged: definePublicProblem({
    code: "TOTP_STATE_CHANGED",
    status: 409,
    title: "2단계 인증 상태가 변경되었습니다.",
    detail: "페이지를 새로고침한 뒤 현재 상태에서 다시 시도해 주세요.",
  }),
  tooManyAttempts: definePublicProblem({
    code: "TOTP_ATTEMPTS_LIMITED",
    status: 429,
    title: "인증 앱 코드 확인을 잠시 멈췄습니다.",
    detail: "시도 횟수가 많습니다. 안내된 시간 뒤 새 코드로 다시 시도해 주세요.",
  }),
  unavailable: definePublicProblem({
    code: "AUTH_SERVICE_UNAVAILABLE",
    status: 503,
    title: "관리자 보안 저장소를 사용할 수 없습니다.",
    detail: "잠시 후 다시 시도해 주세요.",
  }),
  verifiedTotpRequired: definePublicProblem({
    code: "VERIFIED_TOTP_SESSION_REQUIRED",
    status: 403,
    title: "2단계 인증이 확인된 세션이 필요합니다.",
    detail: "인증 앱 코드로 다시 로그인한 뒤 시도해 주세요.",
  }),
});

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isEmptySecurityRequest(value: unknown): boolean {
  return isPlainRecord(value) && Object.keys(value).length === 0;
}

export function readTotpCodeRequest(value: unknown): string | null {
  if (!isPlainRecord(value) || Object.keys(value).length !== 1) return null;
  return typeof value.code === "string" && /^\d{6}$/.test(value.code)
    ? value.code
    : null;
}

export function problemForTotpLifecycleReason(reason: string) {
  const problems = {
    ACCOUNT_NOT_ELIGIBLE: ADMIN_SECURITY_PROBLEMS.accountNotEligible,
    ALREADY_ENABLED: ADMIN_SECURITY_PROBLEMS.alreadyEnabled,
    FORBIDDEN: ADMIN_SECURITY_PROBLEMS.adminRequired,
    INVALID_CODE: ADMIN_SECURITY_PROBLEMS.invalidCode,
    PENDING_SETUP_EXISTS: ADMIN_SECURITY_PROBLEMS.pendingSetupExists,
    SESSION_STALE: ADMIN_SECURITY_PROBLEMS.sessionRequired,
    SETUP_REQUIRED: ADMIN_SECURITY_PROBLEMS.setupRequired,
    STATE_CHANGED: ADMIN_SECURITY_PROBLEMS.stateChanged,
    TOTP_REPLAY: ADMIN_SECURITY_PROBLEMS.replayedCode,
    UNAVAILABLE: ADMIN_SECURITY_PROBLEMS.unavailable,
  } as const;

  return problems[reason as keyof typeof problems] ?? ADMIN_SECURITY_PROBLEMS.unavailable;
}
