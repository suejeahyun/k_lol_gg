import { definePublicProblem, problemResponse } from "@/platform/http";

export type KakaoV4HttpErrorCode =
  | "QUERY_FORBIDDEN"
  | "FORBIDDEN_IDENTITY_HEADER"
  | "COMMAND_INVALID"
  | "SIGNING_KEY_UNAVAILABLE"
  | "SIGNATURE_INVALID"
  | "TIMESTAMP_STALE"
  | "IDEMPOTENCY_MISMATCH"
  | "ROUTER_NOT_ENABLED"
  | "UNAVAILABLE";

const problems = Object.freeze({
  QUERY_FORBIDDEN: definePublicProblem({ code: "QUERY_FORBIDDEN", status: 400, title: "쿼리 매개변수를 사용할 수 없습니다.", detail: "V4 command gateway에는 JSON 본문만 전송해 주세요." }),
  FORBIDDEN_IDENTITY_HEADER: definePublicProblem({ code: "KAKAO_V4_FORBIDDEN_IDENTITY_HEADER", status: 400, title: "V4에서 허용하지 않는 식별 헤더입니다.", detail: "방, 채널, 발신자 식별 헤더를 제거하고 V4 envelope만 전송해 주세요." }),
  COMMAND_INVALID: definePublicProblem({ code: "KAKAO_V4_COMMAND_INVALID", status: 400, title: "Kakao V4 명령이 올바르지 않습니다.", detail: "profileId, installationId, senderId, eventId, timestamp, nonce, text를 확인해 주세요." }),
  SIGNING_KEY_UNAVAILABLE: definePublicProblem({ code: "KAKAO_V4_SIGNING_UNAVAILABLE", status: 503, title: "V4 서명 검증을 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
  SIGNATURE_INVALID: definePublicProblem({ code: "INVALID_SIGNATURE", status: 401, title: "V4 봇 설치 인증 실패", detail: "MessengerBot 설치본의 서버 주소, key ID와 서명 키를 확인해 주세요." }),
  TIMESTAMP_STALE: definePublicProblem({ code: "KAKAO_V4_TIMESTAMP_STALE", status: 401, title: "V4 요청 시간이 유효하지 않습니다.", detail: "휴대폰 시간을 자동으로 맞춘 뒤 다시 시도해 주세요." }),
  IDEMPOTENCY_MISMATCH: definePublicProblem({ code: "IDEMPOTENCY_MISMATCH", status: 409, title: "event ID가 다른 요청에 재사용되었습니다.", detail: "새 event ID로 다시 전송해 주세요." }),
  ROUTER_NOT_ENABLED: definePublicProblem({ code: "KAKAO_V4_COMMAND_ROUTER_NOT_ENABLED", status: 501, title: "V4 명령 라우터가 아직 연결되지 않았습니다.", detail: "현재는 V4상태와 V4계약확인만 사용할 수 있습니다. 일반 명령은 기존 V41 봇을 사용해 주세요." }),
  UNAVAILABLE: definePublicProblem({ code: "KAKAO_V4_UNAVAILABLE", status: 503, title: "V4 command gateway를 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
});

export function kakaoV4ProblemResponse(code: KakaoV4HttpErrorCode, traceId?: string, headers?: HeadersInit) {
  return problemResponse(problems[code], { traceId, headers });
}

/** Keep application and database error classes out of the public V4 contract. */
export function kakaoV4CommandFailureResponse(error: unknown, traceId?: string) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  if (code === "IDEMPOTENCY_MISMATCH") return kakaoV4ProblemResponse("IDEMPOTENCY_MISMATCH", traceId);
  if (code === "INVALID_COMMAND" || code === "PROFILE_MISMATCH" || code === "NOT_FOUND") {
    return kakaoV4ProblemResponse("COMMAND_INVALID", traceId);
  }
  return kakaoV4ProblemResponse("UNAVAILABLE", traceId);
}
