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

import type { StatisticsRecalculationResult } from "../application/ports/statistics-query-repository";
import type { StatisticsCommandContext } from "../application/statistics-service";
import { StatisticsServiceError } from "../application/statistics-service";

const STATISTICS_HTTP_PROBLEMS = Object.freeze({
  forbidden: definePublicProblem({
    code: "FORBIDDEN",
    status: 403,
    title: "이 작업을 수행할 권한이 없습니다.",
    detail: "현재 관리자 역할과 2단계 인증 상태를 확인해 주세요.",
  }),
  idempotencyMismatch: definePublicProblem({
    code: "IDEMPOTENCY_MISMATCH",
    status: 409,
    title: "멱등성 키가 다른 요청에 사용되었습니다.",
    detail: "새 Idempotency-Key로 다시 요청해 주세요.",
  }),
  invalidInput: definePublicProblem({
    code: "INVALID_INPUT",
    status: 400,
    title: "통계 요청 값이 올바르지 않습니다.",
    detail: "시즌 식별자와 조회 조건을 확인해 주세요.",
  }),
  notFound: definePublicProblem({
    code: "NOT_FOUND",
    status: 404,
    title: "요청한 통계 대상을 찾을 수 없습니다.",
    detail: "시즌 또는 플레이어 식별자를 확인해 주세요.",
  }),
  originForbidden: definePublicProblem({
    code: "ORIGIN_FORBIDDEN",
    status: 403,
    title: "허용되지 않은 요청 출처입니다.",
    detail: "같은 사이트에서 다시 요청해 주세요.",
  }),
  preconditionFailed: definePublicProblem({
    code: "PRECONDITION_FAILED",
    status: 412,
    title: "통계 상태가 먼저 변경되었습니다.",
    detail: "최신 projection revision을 불러온 뒤 다시 시도해 주세요.",
  }),
  serviceUnavailable: definePublicProblem({
    code: "STATISTICS_SERVICE_UNAVAILABLE",
    status: 503,
    title: "통계 데이터를 처리할 수 없습니다.",
    detail: "잠시 후 다시 시도해 주세요.",
  }),
  unauthenticated: definePublicProblem({
    code: "UNAUTHENTICATED",
    status: 401,
    title: "관리자 로그인이 필요합니다.",
    detail: "관리자 로그인과 2단계 인증을 완료해 주세요.",
  }),
});

export async function requireStatisticsApiSession(requiredRole: AuthRole): Promise<
  | { ok: true; session: AuthSession }
  | { ok: false; response: Response }
> {
  const decision = await authorizeApiRole(requiredRole);
  if (decision.allowed) return { ok: true, session: decision.session };
  return {
    ok: false,
    response: problemResponse(
      decision.reason === "UNAUTHENTICATED"
        ? STATISTICS_HTTP_PROBLEMS.unauthenticated
        : STATISTICS_HTTP_PROBLEMS.forbidden,
    ),
  };
}

export async function prepareStatisticsMutation(
  request: Request,
  session: AuthSession,
): Promise<
  | { ok: true; value: { body: unknown; context: StatisticsCommandContext; expectedGeneration: number; traceId?: string } }
  | { ok: false; response: Response }
> {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) {
    return { ok: false, response: problemResponse(STATISTICS_HTTP_PROBLEMS.invalidInput, { traceId }) };
  }
  const configuredOrigin = process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN;
  if (!hasSameOrigin(request, configuredOrigin)) {
    return { ok: false, response: problemResponse(STATISTICS_HTTP_PROBLEMS.originForbidden, { traceId }) };
  }
  const body = await readJsonBody(request, { maximumBytes: 2 * 1024 });
  if (!body.ok) {
    return { ok: false, response: problemResponse(problemForJsonBodyError(body.error), { traceId }) };
  }
  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) {
    return { ok: false, response: problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId }) };
  }
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) {
    return { ok: false, response: problemResponse(problemForIfMatchRevisionError(revision.error), { traceId }) };
  }
  return {
    ok: true,
    value: {
      body: body.value,
      expectedGeneration: revision.revision,
      traceId,
      context: {
        actorSession: transactionSessionActor(session),
        requestId: randomUUID(),
        idempotencyMaterial: idempotencyHashMaterial(idempotency.key, "admin:statistics:recalculate"),
      },
    },
  };
}

export function statisticsReadResponse(body: unknown, status = 200, traceId?: string): Response {
  return noStoreJsonResponse(body, { status, traceId });
}

export function statisticsMutationResponse(
  result: StatisticsRecalculationResult,
  traceId?: string,
): Response {
  const headers = new Headers({ ETag: formatRevisionEtag(result.revision) });
  if (result.replayed) headers.set("Idempotency-Replayed", "true");
  return noStoreJsonResponse(result.body, { status: result.status, headers, traceId });
}

export function statisticsServiceErrorResponse(error: unknown, traceId?: string): Response {
  if (error instanceof StatisticsServiceError) {
    const problem = {
      FORBIDDEN: STATISTICS_HTTP_PROBLEMS.forbidden,
      IDEMPOTENCY_MISMATCH: STATISTICS_HTTP_PROBLEMS.idempotencyMismatch,
      INVALID_INPUT: STATISTICS_HTTP_PROBLEMS.invalidInput,
      NOT_FOUND: STATISTICS_HTTP_PROBLEMS.notFound,
      PRECONDITION_FAILED: STATISTICS_HTTP_PROBLEMS.preconditionFailed,
      SESSION_STALE: STATISTICS_HTTP_PROBLEMS.unauthenticated,
    }[error.code];
    return problemResponse(problem, { traceId });
  }
  return problemResponse(STATISTICS_HTTP_PROBLEMS.serviceUnavailable, { traceId });
}

export function statisticsUnavailableResponse(traceId?: string): Response {
  return problemResponse(STATISTICS_HTTP_PROBLEMS.serviceUnavailable, { traceId });
}

export function statisticsInvalidInputResponse(traceId?: string): Response {
  return problemResponse(STATISTICS_HTTP_PROBLEMS.invalidInput, { traceId });
}

export function statisticsNotFoundResponse(traceId?: string): Response {
  return problemResponse(STATISTICS_HTTP_PROBLEMS.notFound, { traceId });
}
