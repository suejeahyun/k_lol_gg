import { definePublicProblem } from "@/platform/http";

export const PLAYER_HTTP_PROBLEMS = Object.freeze({
  conflictLegacyId: definePublicProblem({
    code: "PLAYER_LEGACY_ID_CONFLICT",
    status: 409,
    title: "기존 플레이어 번호가 중복됩니다.",
    detail: "다른 플레이어가 사용하지 않는 기존 번호를 입력해 주세요.",
  }),
  conflictRiotId: definePublicProblem({
    code: "PLAYER_RIOT_ID_CONFLICT",
    status: 409,
    title: "Riot ID가 중복됩니다.",
    detail: "동일한 닉네임과 태그 조합의 플레이어가 이미 등록되어 있습니다.",
  }),
  forbidden: definePublicProblem({
    code: "ADMIN_FORBIDDEN",
    status: 403,
    title: "관리자 권한이 필요합니다.",
    detail: "이 작업을 수행할 수 있는 관리자 계정으로 다시 확인해 주세요.",
  }),
  idempotencyConflict: definePublicProblem({
    code: "IDEMPOTENCY_KEY_REUSED",
    status: 409,
    title: "멱등성 키가 다른 요청에 사용되었습니다.",
    detail: "새 Idempotency-Key를 만들어 다시 요청해 주세요.",
  }),
  invalidPlayerInput: definePublicProblem({
    code: "INVALID_PLAYER_INPUT",
    status: 400,
    title: "플레이어 입력값이 올바르지 않습니다.",
    detail: "회원명, Riot ID, 기존 번호와 티어 형식을 확인해 주세요.",
  }),
  invalidPlayerQuery: definePublicProblem({
    code: "INVALID_PLAYER_QUERY",
    status: 400,
    title: "플레이어 조회 조건이 올바르지 않습니다.",
    detail: "검색어, 상태, 페이지와 페이지 크기를 확인해 주세요.",
  }),
  notFound: definePublicProblem({
    code: "PLAYER_NOT_FOUND",
    status: 404,
    title: "플레이어를 찾을 수 없습니다.",
    detail: "주소 또는 플레이어 상태를 확인해 주세요.",
  }),
  originForbidden: definePublicProblem({
    code: "ORIGIN_FORBIDDEN",
    status: 403,
    title: "허용되지 않은 요청 출처입니다.",
    detail: "K-LOL.GG 관리자 화면에서 다시 시도해 주세요.",
  }),
  revisionMismatch: definePublicProblem({
    code: "REVISION_MISMATCH",
    status: 412,
    title: "플레이어 정보가 이미 변경되었습니다.",
    detail: "최신 정보를 다시 불러온 뒤 변경 내용을 확인해 주세요.",
  }),
  unauthorized: definePublicProblem({
    code: "ADMIN_UNAUTHENTICATED",
    status: 401,
    title: "관리자 로그인이 필요합니다.",
    detail: "관리자 로그인 후 다시 시도해 주세요.",
  }),
  unavailable: definePublicProblem({
    code: "PLAYER_DATA_UNAVAILABLE",
    status: 503,
    title: "플레이어 저장소를 사용할 수 없습니다.",
    detail: "잠시 후 다시 시도해 주세요.",
  }),
});
