import { createHash, randomUUID } from "node:crypto";

import type { AuthRole, AuthSession } from "@/modules/auth/domain/auth-session";
import { transactionSessionActor } from "@/modules/auth/domain/transaction-session";
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

import type { OperationsActor, OperationsCommandMetadata, OperationsCommandResult } from "../application/ports";
import { OperationsError } from "./postgres-operations-repository";

const problems = Object.freeze({
  forbidden: definePublicProblem({ code: "FORBIDDEN", status: 403, title: "요청 권한이 없습니다.", detail: "필요한 권한과 2단계 인증을 확인해 주세요." }),
  invalid: definePublicProblem({ code: "INVALID_INPUT", status: 400, title: "입력값이 올바르지 않습니다.", detail: "입력 범위와 요청 형식을 확인해 주세요." }),
  conflict: definePublicProblem({ code: "IDEMPOTENCY_MISMATCH", status: 409, title: "멱등성 키가 다른 요청에 사용되었습니다.", detail: "새 Idempotency-Key로 다시 요청해 주세요." }),
  precondition: definePublicProblem({ code: "PRECONDITION_FAILED", status: 412, title: "설정이 이미 변경되었습니다.", detail: "최신 설정을 불러온 뒤 다시 시도해 주세요." }),
  unavailable: definePublicProblem({ code: "OPERATIONS_UNAVAILABLE", status: 503, title: "운영 서비스를 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
  unauthenticated: definePublicProblem({ code: "UNAUTHENTICATED", status: 401, title: "로그인이 필요합니다.", detail: "로그인한 뒤 다시 시도해 주세요." }),
  origin: definePublicProblem({ code: "ORIGIN_FORBIDDEN", status: 403, title: "허용되지 않은 요청 출처입니다.", detail: "같은 사이트에서 다시 요청해 주세요." }),
  job: definePublicProblem({ code: "JOB_AUTH_FAILED", status: 401, title: "작업 인증에 실패했습니다.", detail: "서명과 전송 시각을 확인해 주세요." }),
});

export async function requireOperationsApiSession(requiredRole: AuthRole) {
  const decision = await authorizeApiRole(requiredRole);
  if (decision.allowed) return { ok: true as const, session: decision.session };
  return { ok: false as const, response: problemResponse(decision.reason === "UNAUTHENTICATED" ? problems.unauthenticated : problems.forbidden) };
}

export function operationsActor(session: AuthSession): OperationsActor {
  return { session: transactionSessionActor(session), role: session.role, accountStatus: session.accountStatus };
}

export async function prepareOperationsMutation(request: Request, maximumBytes = 64 * 1_024) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return { ok: false as const, response: problemResponse(problems.invalid, { traceId }) };
  if (!hasSameOrigin(request, process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN)) return { ok: false as const, response: problemResponse(problems.origin, { traceId }) };
  const body = await readJsonBody(request, { maximumBytes });
  if (!body.ok) return { ok: false as const, response: problemResponse(problemForJsonBodyError(body.error), { traceId }) };
  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) return { ok: false as const, response: problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId }) };
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) return { ok: false as const, response: problemResponse(problemForIfMatchRevisionError(revision.error), { traceId }) };
  return {
    ok: true as const,
    body: body.value,
    metadata: {
      requestId: randomUUID(), requestKey: idempotency.key.normalized,
      requestHashHex: createHash("sha256").update(JSON.stringify(body.value)).digest("hex"),
      expectedRevision: revision.revision,
    } satisfies OperationsCommandMetadata,
    traceId,
  };
}

export function operationsMutationResponse<T extends Record<string, unknown>>(result: OperationsCommandResult<T>, traceId?: string) {
  return noStoreJsonResponse(result.body, { status: result.status, traceId, headers: {
    ETag: formatRevisionEtag(result.revision),
    ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}),
  } });
}

export function operationsErrorResponse(error: unknown, traceId?: string) {
  if (error instanceof OperationsError) {
    if (error.code === "SESSION_STALE") return problemResponse(problems.unauthenticated, { traceId });
    if (error.code === "IDEMPOTENCY_MISMATCH") return problemResponse(problems.conflict, { traceId });
    if (error.code === "STALE_SITE_SETTINGS_REVISION") return problemResponse(problems.precondition, { traceId });
    if (error.code.startsWith("INVALID_")) return problemResponse(problems.invalid, { traceId });
    if (error.code === "JOB_NONCE_REPLAYED") return problemResponse(problems.job, { traceId });
  }
  if (error instanceof Error && error.message === "STALE_SITE_SETTINGS_REVISION") return problemResponse(problems.precondition, { traceId });
  if (error instanceof Error && /^INVALID_/u.test(error.message)) return problemResponse(problems.invalid, { traceId });
  return problemResponse(problems.unavailable, { traceId });
}

export function operationsUnavailableResponse(traceId?: string) { return problemResponse(problems.unavailable, { traceId }); }
export function operationsInvalidResponse(traceId?: string) { return problemResponse(problems.invalid, { traceId }); }
export function jobAuthenticationErrorResponse(traceId?: string) { return problemResponse(problems.job, { traceId }); }
