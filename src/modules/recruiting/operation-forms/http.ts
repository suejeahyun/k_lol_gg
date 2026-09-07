import { createHash } from "node:crypto";

import { hasSameOrigin } from "@/modules/auth/application/mutation-request-guard";
import { authorizeApiRole } from "@/modules/auth/infrastructure/server-authorization";
import {
  definePublicProblem,
  formatRevisionEtag,
  noStoreJsonResponse,
  problemForIdempotencyKeyError,
  problemForIfMatchRevisionError,
  problemForJsonBodyError,
  problemResponse,
  readIdempotencyKey,
  readIfMatchRevision,
  readJsonBody,
  readValidatedTraceId,
} from "@/platform/http";

import { OperationFormError } from "./domain";
import { OperationFormApplicationError, type OperationFormMutationResult } from "./postgres-operation-forms";

const problems = Object.freeze({
  forbidden: definePublicProblem({ code: "FORBIDDEN", status: 403, title: "요청 권한이 없습니다.", detail: "관리자 보안 인증을 확인해 주세요." }),
  invalid: definePublicProblem({ code: "INVALID_OPERATION_FORM", status: 400, title: "신청서 입력이 올바르지 않습니다.", detail: "신청 유형과 필수 항목을 확인해 주세요." }),
  mismatch: definePublicProblem({ code: "IDEMPOTENCY_MISMATCH", status: 409, title: "멱등성 키가 다른 요청에 사용되었습니다.", detail: "새 Idempotency-Key로 다시 요청해 주세요." }),
  notFound: definePublicProblem({ code: "NOT_FOUND", status: 404, title: "운영 신청서를 찾을 수 없습니다.", detail: "주소와 신청 유형을 확인해 주세요." }),
  origin: definePublicProblem({ code: "ORIGIN_FORBIDDEN", status: 403, title: "허용되지 않은 요청 출처입니다.", detail: "같은 사이트에서 다시 시도해 주세요." }),
  precondition: definePublicProblem({ code: "PRECONDITION_FAILED", status: 412, title: "다른 변경이 먼저 반영되었습니다.", detail: "최신 신청서를 다시 불러와 주세요." }),
  unavailable: definePublicProblem({ code: "OPERATION_FORMS_UNAVAILABLE", status: 503, title: "운영 신청 서비스를 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
  unauthenticated: definePublicProblem({ code: "UNAUTHENTICATED", status: 401, title: "관리자 로그인이 필요합니다.", detail: "관리자 계정으로 다시 로그인해 주세요." }),
  webhook: definePublicProblem({ code: "WEBHOOK_FORBIDDEN", status: 401, title: "웹훅 인증에 실패했습니다.", detail: "서명과 발신 설정을 확인해 주세요." }),
});

export async function requireOperationFormAdmin() {
  const decision = await authorizeApiRole("ADMIN");
  if (decision.allowed) return { ok: true as const, session: decision.session };
  return { ok: false as const, response: problemResponse(decision.reason === "UNAUTHENTICATED" ? problems.unauthenticated : problems.forbidden) };
}

export async function prepareOperationFormMutation(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size || !hasSameOrigin(request, process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN)) {
    return { ok: false as const, response: problemResponse(problems.origin, { traceId }) };
  }
  const body = await readJsonBody(request, { maximumBytes: 8 * 1_024 });
  if (!body.ok) return { ok: false as const, response: problemResponse(problemForJsonBodyError(body.error), { traceId }) };
  const key = readIdempotencyKey(request.headers);
  if (!key.ok) return { ok: false as const, response: problemResponse(problemForIdempotencyKeyError(key.error), { traceId }) };
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) return { ok: false as const, response: problemResponse(problemForIfMatchRevisionError(revision.error), { traceId }) };
  return {
    ok: true as const, body: body.value, expectedRevision: revision.revision,
    idempotency: { requestKey: key.key.normalized, bodyDigestHex: createHash("sha256").update(JSON.stringify(body.value)).digest("hex") }, traceId,
  };
}

export function operationFormMutationResponse(result: OperationFormMutationResult, traceId?: string) {
  return noStoreJsonResponse(result.body, { status: result.status, traceId, headers: {
    ETag: formatRevisionEtag(result.revision), ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}),
  } });
}

export function operationFormReadResponse(body: unknown, traceId?: string) { return noStoreJsonResponse(body, { traceId }); }
export function operationFormUnavailableResponse(traceId?: string) { return problemResponse(problems.unavailable, { traceId }); }
export function operationFormWebhookForbiddenResponse(traceId?: string) { return problemResponse(problems.webhook, { traceId }); }

export function operationFormErrorResponse(error: unknown, traceId?: string) {
  if (error instanceof OperationFormApplicationError) {
    return problemResponse({
      IDEMPOTENCY_MISMATCH: problems.mismatch, NOT_FOUND: problems.notFound,
      SESSION_STALE: problems.unauthenticated, FORBIDDEN: problems.forbidden,
    }[error.code], { traceId });
  }
  if (error instanceof OperationFormError) {
    return problemResponse(error.code === "STALE_FORM_REVISION" ? problems.precondition : error.code === "INVALID_FORM_TRANSITION" || error.code === "FORM_ALREADY_DELETED" ? problems.precondition : problems.invalid, { traceId });
  }
  return problemResponse(problems.unavailable, { traceId });
}
