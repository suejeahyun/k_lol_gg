import {
  definePublicProblem,
  noStoreJsonResponse,
  problemForIdempotencyKeyError,
  problemForJsonBodyError,
  problemResponse,
  readIdempotencyKey,
  readJsonBody,
  readValidatedTraceId,
} from "@/platform/http";

import { MAXIMUM_KAKAO_BODY_BYTES, readVerifiedKakaoHttpRequest } from "../infrastructure/kakao-http-request";
import { KakaoAssistantError } from "./domain";
import type { KakaoAssistantResult } from "./postgres-kakao-assistant";

const problems = Object.freeze({
  forbidden: definePublicProblem({ code: "WEBHOOK_FORBIDDEN", status: 401, title: "웹훅 인증에 실패했습니다.", detail: "서명과 발신 설정을 확인해 주세요." }),
  invalid: definePublicProblem({ code: "INVALID_KAKAO_REQUEST", status: 400, title: "Kakao 요청이 올바르지 않습니다.", detail: "명령과 허용된 입력 필드를 확인해 주세요." }),
  mismatch: definePublicProblem({ code: "IDEMPOTENCY_MISMATCH", status: 409, title: "멱등성 키가 다른 요청에 사용되었습니다.", detail: "새 Idempotency-Key로 다시 요청해 주세요." }),
  unavailable: definePublicProblem({ code: "KAKAO_ASSISTANT_UNAVAILABLE", status: 503, title: "Kakao 보조 서비스를 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
  seasonMapping: definePublicProblem({ code: "KAKAO_SEASON_OWNER_MAPPING_UNAVAILABLE", status: 503, title: "Kakao 시즌 신청을 처리할 수 없습니다.", detail: "발신자를 승인 계정의 플레이어로 안전하게 확인할 수 없어 변경하지 않았습니다." }),
  imageSession: definePublicProblem({ code: "KAKAO_IMAGE_SESSION_UNAVAILABLE", status: 503, title: "Kakao 이미지 접수를 처리할 수 없습니다.", detail: "검증된 비공개 업로드 세션이 없어 이미지를 저장하지 않았습니다." }),
});

export async function prepareKakaoSignedJson(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const verified = await readVerifiedKakaoHttpRequest(request);
  if (!verified) return { ok: false as const, response: problemResponse(problems.forbidden, { traceId }) };
  const parsed = await readJsonBody(new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") ?? "" },
    body: verified.rawBody,
  }), { maximumBytes: MAXIMUM_KAKAO_BODY_BYTES });
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
  }
  return problemResponse(problems.unavailable, { traceId });
}

export function kakaoAssistantUnavailableResponse(traceId?: string) {
  return problemResponse(problems.unavailable, { traceId });
}

export function kakaoSeasonMappingUnavailableResponse(traceId?: string) {
  return problemResponse(problems.seasonMapping, { traceId });
}

export function kakaoImageSessionUnavailableResponse(traceId?: string) {
  return problemResponse(problems.imageSession, { traceId });
}
