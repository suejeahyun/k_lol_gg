import {
  definePublicProblem,
  formatRevisionEtag,
  noStoreJsonResponse,
  problemForIdempotencyKeyError,
  problemForJsonBodyError,
  problemResponse,
  readIdempotencyKey,
  readJsonBody,
  readValidatedTraceId,
} from "@/platform/http";

import {
  MAXIMUM_KAKAO_BODY_BYTES,
  TRUSTED_KAKAO_SENDER_COMMAND,
  recordKakaoWebhookRejection,
  verifyKakaoHttpRequest,
  type KakaoWebhookAuthorizationPolicy,
} from "../infrastructure/kakao-http-request";
import { KakaoAssistantError } from "./domain";
import type { KakaoAssistantResult } from "./postgres-kakao-assistant";
import type { KakaoImageSessionResult } from "./postgres-kakao-image-receive";
import { kakaoWebhookFailureResponse } from "../kakao-access/http";

const problems = Object.freeze({
  forbidden: definePublicProblem({ code: "KAKAO_INTEGRATION_ERROR", status: 401, title: "연동 설정 오류", detail: "연동 설정 오류: 봇의 서버 주소와 서명 설정을 확인해 주세요." }),
  roomForbidden: definePublicProblem({ code: "KAKAO_ROOM_FORBIDDEN", status: 403, title: "이 카카오톡 설치본은 아직 연동되지 않았습니다.", detail: "이 봇 설치본은 아직 canonical 방에 연결되지 않았습니다. /V2연동확인 결과를 관리자에게 전달해 주세요." }),
  capabilityForbidden: definePublicProblem({ code: "KAKAO_CAPABILITY_FORBIDDEN", status: 403, title: "이 기능 권한 없음", detail: "이 기능 권한 없음: 이 요청에 필요한 권한을 확인해 주세요." }),
  invalid: definePublicProblem({ code: "FORM_INVALID", status: 400, title: "Kakao 요청이 올바르지 않습니다.", detail: "명령과 허용된 입력 필드를 확인해 주세요." }),
  mismatch: definePublicProblem({ code: "CONFLICT", status: 409, title: "멱등성 키가 다른 요청에 사용되었습니다.", detail: "새 Idempotency-Key로 다시 요청해 주세요." }),
  unavailable: definePublicProblem({ code: "KAKAO_ASSISTANT_UNAVAILABLE", status: 503, title: "Kakao 보조 서비스를 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
  notFound: definePublicProblem({ code: "KAKAO_TARGET_NOT_FOUND", status: 404, title: "대상을 찾을 수 없습니다.", detail: "요청한 Kakao 연동 대상을 찾을 수 없습니다." }),
  conflict: definePublicProblem({ code: "CONFLICT", status: 409, title: "현재 상태에서는 처리할 수 없습니다.", detail: "운영 날짜, 모집 기간 또는 기존 검토 상태를 확인해 주세요." }),
  precondition: definePublicProblem({ code: "PRECONDITION_FAILED", status: 412, title: "다른 변경이 먼저 반영되었습니다.", detail: "최신 상태를 확인한 뒤 다시 시도해 주세요." }),
  ownerForbidden: definePublicProblem({ code: "FORBIDDEN", status: 403, title: "요청 권한이 없습니다.", detail: "승인된 대상 소유자 계정으로 다시 시도해 주세요." }),
});

export async function prepareKakaoSignedJson(
  request: Request,
  maximumBytes = MAXIMUM_KAKAO_BODY_BYTES,
  policy: KakaoWebhookAuthorizationPolicy = TRUSTED_KAKAO_SENDER_COMMAND,
) {
  const traceId = readValidatedTraceId(request.headers);
  const verification = await verifyKakaoHttpRequest(request, new Date(), maximumBytes, policy);
  if (!verification.ok) {
    recordKakaoWebhookRejection(verification.code, { route: new URL(request.url).pathname, traceId, request });
    return { ok: false as const, response: kakaoWebhookFailureResponse(verification.code, traceId) };
  }
  const verified = verification.value;
  const parsed = await readJsonBody(new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") ?? "" },
    body: verified.rawBody,
  }), { maximumBytes });
  if (!parsed.ok) return { ok: false as const, response: problemResponse(problemForJsonBodyError(parsed.error), { traceId }) };
  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) return { ok: false as const, response: problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId }) };
  return {
    ok: true as const,
    body: parsed.value,
    intent: verified.intent,
    requestKey: idempotency.key.normalized,
    traceId,
  };
}

export function kakaoAssistantResponse(result: KakaoAssistantResult, traceId?: string) {
  return noStoreJsonResponse(result.body, {
    traceId,
    headers: result.replayed ? { "Idempotency-Replayed": "true" } : undefined,
  });
}

export function kakaoAssistantErrorResponse(error: unknown, traceId?: string) {
  if (error instanceof KakaoAssistantError) {
    if (error.code === "INVALID_INPUT") return problemResponse(problems.invalid, { traceId });
    if (error.code === "IDEMPOTENCY_MISMATCH") return problemResponse(problems.mismatch, { traceId });
    if (error.code === "NONCE_CONFLICT") return problemResponse(problems.forbidden, { traceId });
    if (error.code === "NOT_FOUND") return problemResponse(problems.notFound, { traceId });
    if (error.code === "CONFLICT") return problemResponse(problems.conflict, { traceId });
    if (error.code === "INVALID_STATE") return problemResponse(problems.conflict, { traceId });
    if (error.code === "FORBIDDEN") return problemResponse(problems.forbidden, { traceId });
    if (error.code === "PRECONDITION_FAILED") return problemResponse(problems.precondition, { traceId });
  }
  return problemResponse(problems.unavailable, { traceId });
}

export function kakaoImageSessionResponse(result: KakaoImageSessionResult, traceId?: string) {
  return noStoreJsonResponse(result.body, {
    traceId,
    headers: {
      ETag: formatRevisionEtag(result.revision),
      ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}),
    },
  });
}

export function kakaoOwnerImageSessionErrorResponse(error: unknown, traceId?: string) {
  if (error instanceof KakaoAssistantError) {
    if (error.code === "INVALID_INPUT") return problemResponse(problems.invalid, { traceId });
    if (error.code === "IDEMPOTENCY_MISMATCH") return problemResponse(problems.mismatch, { traceId });
    if (error.code === "NOT_FOUND") return problemResponse(problems.notFound, { traceId });
    if (error.code === "FORBIDDEN") return problemResponse(problems.ownerForbidden, { traceId });
    if (error.code === "PRECONDITION_FAILED") return problemResponse(problems.precondition, { traceId });
    if (error.code === "CONFLICT") return problemResponse(problems.conflict, { traceId });
  }
  return problemResponse(problems.unavailable, { traceId });
}

export function kakaoAssistantUnavailableResponse(traceId?: string) {
  return problemResponse(problems.unavailable, { traceId });
}

export function kakaoAssistantCapabilityForbiddenResponse(traceId?: string) {
  return problemResponse(problems.capabilityForbidden, { traceId });
}
