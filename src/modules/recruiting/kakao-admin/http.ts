import { definePublicProblem, noStoreJsonResponse, problemResponse } from "@/platform/http";
import { KakaoAdminError } from "./postgres-kakao-admin";

const problems = Object.freeze({
  conflict: definePublicProblem({ code: "IDEMPOTENCY_MISMATCH", status: 409, title: "멱등성 키 충돌", detail: "새 멱등성 키로 다시 시도해 주세요." }),
  forbidden: definePublicProblem({ code: "FORBIDDEN", status: 403, title: "요청 권한이 없습니다.", detail: "SUPER 관리자와 2단계 인증을 확인해 주세요." }),
  invalid: definePublicProblem({ code: "INVALID_INPUT", status: 400, title: "입력값이 올바르지 않습니다.", detail: "허용된 설정 필드와 범위를 확인해 주세요." }),
  precondition: definePublicProblem({ code: "PRECONDITION_FAILED", status: 412, title: "설정이 이미 변경되었습니다.", detail: "최신 설정을 다시 불러오세요." }),
  unavailable: definePublicProblem({ code: "KAKAO_ADMIN_UNAVAILABLE", status: 503, title: "Kakao 운영 상태를 확인할 수 없습니다.", detail: "데이터베이스와 migration 상태를 확인해 주세요." }),
});

export function kakaoAdminErrorResponse(error: unknown, traceId?: string) {
  if (error instanceof KakaoAdminError) {
    if (error.code === "INVALID_INPUT") return problemResponse(problems.invalid, { traceId });
    if (error.code === "IDEMPOTENCY_MISMATCH") return problemResponse(problems.conflict, { traceId });
    if (error.code === "SESSION_STALE") return problemResponse(problems.forbidden, { traceId });
    if (error.code === "PRECONDITION_FAILED") return problemResponse(problems.precondition, { traceId });
  }
  return problemResponse(problems.unavailable, { traceId });
}

export function kakaoAdminReadResponse(body: unknown, traceId?: string, headers?: HeadersInit) {
  return noStoreJsonResponse(body, { traceId, headers });
}
