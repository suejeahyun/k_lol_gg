import { randomUUID } from "node:crypto";

import type { AuthRole, AuthSession } from "@/modules/auth/domain/auth-session";
import { transactionSessionActor } from "@/modules/auth/domain/transaction-session";
import { hasSameOrigin } from "@/modules/auth/application/mutation-request-guard";
import { authorizeApiRole } from "@/modules/auth/infrastructure/server-authorization";
import {
  definePublicProblem,
  formatRevisionEtag,
  idempotencyHashMaterial,
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

import type { MmrCommandContext } from "../application/mmr-service";
import { MmrServiceError } from "../application/mmr-service";
import type { MmrMutationResult } from "../application/ports/mmr-repository";

const problems = Object.freeze({
  forbidden: definePublicProblem({ code: "FORBIDDEN", status: 403, title: "MMR 작업 권한이 없습니다.", detail: "관리자 역할과 2단계 인증 상태를 확인해 주세요." }),
  idempotencyMismatch: definePublicProblem({ code: "IDEMPOTENCY_MISMATCH", status: 409, title: "멱등성 키가 이미 사용되었습니다.", detail: "새 Idempotency-Key로 다시 요청해 주세요." }),
  invalidInput: definePublicProblem({ code: "INVALID_INPUT", status: 400, title: "MMR 요청 값이 올바르지 않습니다.", detail: "조회 조건 또는 조정 입력을 확인해 주세요." }),
  notFound: definePublicProblem({ code: "NOT_FOUND", status: 404, title: "MMR 대상을 찾을 수 없습니다.", detail: "플레이어 식별자를 확인해 주세요." }),
  originForbidden: definePublicProblem({ code: "ORIGIN_FORBIDDEN", status: 403, title: "허용되지 않은 요청 출처입니다.", detail: "같은 사이트에서 다시 요청해 주세요." }),
  preconditionFailed: definePublicProblem({ code: "PRECONDITION_FAILED", status: 412, title: "MMR generation이 변경되었습니다.", detail: "최신 상태를 불러온 뒤 다시 시도해 주세요." }),
  unavailable: definePublicProblem({ code: "MMR_SERVICE_UNAVAILABLE", status: 503, title: "MMR 저장소를 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
  unauthenticated: definePublicProblem({ code: "UNAUTHENTICATED", status: 401, title: "관리자 로그인이 필요합니다.", detail: "관리자 로그인과 2단계 인증을 완료해 주세요." }),
});

export async function requireMmrApiSession(role: AuthRole) {
  const decision = await authorizeApiRole(role);
  if (decision.allowed) return { ok: true as const, session: decision.session };
  return {
    ok: false as const,
    response: problemResponse(decision.reason === "UNAUTHENTICATED" ? problems.unauthenticated : problems.forbidden),
  };
}

export async function prepareMmrMutation(request: Request, session: AuthSession, scope: string): Promise<
  | { ok: true; value: { body: unknown; expectedGeneration: number; context: MmrCommandContext; traceId?: string } }
  | { ok: false; response: Response }
> {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return { ok: false, response: problemResponse(problems.invalidInput, { traceId }) };
  if (!hasSameOrigin(request, process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN)) {
    return { ok: false, response: problemResponse(problems.originForbidden, { traceId }) };
  }
  const body = await readJsonBody(request, { maximumBytes: 4 * 1024 });
  if (!body.ok) return { ok: false, response: problemResponse(problemForJsonBodyError(body.error), { traceId }) };
  const key = readIdempotencyKey(request.headers);
  if (!key.ok) return { ok: false, response: problemResponse(problemForIdempotencyKeyError(key.error), { traceId }) };
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) return { ok: false, response: problemResponse(problemForIfMatchRevisionError(revision.error), { traceId }) };
  return {
    ok: true,
    value: {
      body: body.value,
      expectedGeneration: revision.revision,
      traceId,
      context: {
        actorSession: transactionSessionActor(session),
        requestId: randomUUID(),
        idempotencyMaterial: idempotencyHashMaterial(key.key, scope),
      },
    },
  };
}

export function mmrReadResponse(body: unknown, revision?: number, traceId?: string) {
  return noStoreJsonResponse(body, {
    traceId,
    headers: revision === undefined ? undefined : { ETag: formatRevisionEtag(revision) },
  });
}

export function mmrMutationResponse(result: MmrMutationResult, traceId?: string) {
  return noStoreJsonResponse(result.body, {
    status: result.status,
    traceId,
    headers: {
      ETag: formatRevisionEtag(result.revision),
      ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}),
    },
  });
}

export function mmrErrorResponse(error: unknown, traceId?: string) {
  if (error instanceof MmrServiceError) {
    return problemResponse({
      FORBIDDEN: problems.forbidden,
      IDEMPOTENCY_MISMATCH: problems.idempotencyMismatch,
      INVALID_INPUT: problems.invalidInput,
      NOT_FOUND: problems.notFound,
      PRECONDITION_FAILED: problems.preconditionFailed,
      SESSION_STALE: problems.unauthenticated,
    }[error.code], { traceId });
  }
  return problemResponse(problems.unavailable, { traceId });
}

export function mmrInvalidInputResponse(traceId?: string) { return problemResponse(problems.invalidInput, { traceId }); }
export function mmrNotFoundResponse(traceId?: string) { return problemResponse(problems.notFound, { traceId }); }
export function mmrUnavailableResponse(traceId?: string) { return problemResponse(problems.unavailable, { traceId }); }
