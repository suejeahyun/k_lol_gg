import { randomUUID } from "node:crypto";

import type { AuthRole, AuthSession } from "@/modules/auth/domain/auth-session";
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

import type { MutationResult } from "../application/ports/season-repository";
import type { SeasonCommandContext } from "../application/season-service";
import { SeasonServiceError } from "../domain/season";

const SEASON_HTTP_PROBLEMS = Object.freeze({
  activeSeasonExists: definePublicProblem({
    code: "ACTIVE_SEASON_EXISTS",
    status: 409,
    title: "이미 활성 시즌이 있습니다.",
    detail: "현재 활성 시즌을 종료한 뒤 다시 시도해 주세요.",
  }),
  applicationClosed: definePublicProblem({
    code: "APPLICATION_CLOSED",
    status: 409,
    title: "현재 참가 신청 기간이 아닙니다.",
    detail: "시즌의 신청 가능 기간을 확인해 주세요.",
  }),
  applicationReviewed: definePublicProblem({
    code: "APPLICATION_REVIEWED",
    status: 409,
    title: "검토가 끝난 신청입니다.",
    detail: "관리자 검토가 끝난 신청은 직접 수정할 수 없습니다.",
  }),
  conflict: definePublicProblem({
    code: "RESOURCE_CONFLICT",
    status: 409,
    title: "현재 상태에서는 요청을 처리할 수 없습니다.",
    detail: "최신 상태를 확인한 뒤 다시 시도해 주세요.",
  }),
  forbidden: definePublicProblem({
    code: "FORBIDDEN",
    status: 403,
    title: "이 작업을 수행할 권한이 없습니다.",
    detail: "현재 계정 상태와 역할을 확인해 주세요.",
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
    title: "입력 값이 올바르지 않습니다.",
    detail: "필수 값과 허용된 형식을 확인해 주세요.",
  }),
  invalidTransition: definePublicProblem({
    code: "INVALID_TRANSITION",
    status: 409,
    title: "현재 상태에서는 변경할 수 없습니다.",
    detail: "최신 상태를 확인한 뒤 허용된 상태 변경을 다시 시도해 주세요.",
  }),
  notFound: definePublicProblem({
    code: "NOT_FOUND",
    status: 404,
    title: "요청한 항목을 찾을 수 없습니다.",
    detail: "주소와 최신 상태를 확인해 주세요.",
  }),
  originForbidden: definePublicProblem({
    code: "ORIGIN_FORBIDDEN",
    status: 403,
    title: "허용되지 않은 요청 출처입니다.",
    detail: "같은 사이트에서 다시 요청해 주세요.",
  }),
  playerRequired: definePublicProblem({
    code: "PLAYER_REQUIRED",
    status: 409,
    title: "연결된 활성 플레이어가 필요합니다.",
    detail: "계정에 플레이어를 연결한 뒤 다시 시도해 주세요.",
  }),
  rateLimited: definePublicProblem({
    code: "RATE_LIMITED",
    status: 429,
    title: "요청이 너무 많습니다.",
    detail: "잠시 기다린 뒤 다시 시도해 주세요.",
  }),
  rateLimitUnavailable: definePublicProblem({
    code: "RATE_LIMIT_UNAVAILABLE",
    status: 503,
    title: "요청 제한 상태를 확인할 수 없습니다.",
    detail: "안전한 처리를 위해 잠시 후 다시 시도해 주세요.",
  }),
  preconditionFailed: definePublicProblem({
    code: "PRECONDITION_FAILED",
    status: 412,
    title: "다른 변경이 먼저 반영되었습니다.",
    detail: "최신 데이터를 불러온 뒤 다시 시도해 주세요.",
  }),
  serviceUnavailable: definePublicProblem({
    code: "SEASON_SERVICE_UNAVAILABLE",
    status: 503,
    title: "시즌 데이터를 불러올 수 없습니다.",
    detail: "잠시 후 다시 시도해 주세요.",
  }),
  unauthenticated: definePublicProblem({
    code: "UNAUTHENTICATED",
    status: 401,
    title: "로그인이 필요합니다.",
    detail: "로그인한 뒤 다시 시도해 주세요.",
  }),
});

export type PreparedSeasonMutation = Readonly<{
  body: unknown;
  context: SeasonCommandContext;
  expectedRevision: number;
  traceId?: string;
}>;

export async function requireSeasonApiSession(requiredRole: AuthRole): Promise<
  | { ok: true; session: AuthSession }
  | { ok: false; response: Response }
> {
  const decision = await authorizeApiRole(requiredRole);
  if (decision.allowed) return { ok: true, session: decision.session };
  return {
    ok: false,
    response: problemResponse(
      decision.reason === "UNAUTHENTICATED"
        ? SEASON_HTTP_PROBLEMS.unauthenticated
        : SEASON_HTTP_PROBLEMS.forbidden,
    ),
  };
}

export async function prepareSeasonMutation(
  request: Request,
  scope: string,
  actorUserAccountId: string,
): Promise<{ ok: true; value: PreparedSeasonMutation } | { ok: false; response: Response }> {
  const traceId = readValidatedTraceId(request.headers);
  const queryProblem = rejectSeasonQuery(request, traceId);
  if (queryProblem) return { ok: false, response: queryProblem };
  const configuredOrigin = process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN;
  if (!hasSameOrigin(request, configuredOrigin)) {
    return {
      ok: false,
      response: problemResponse(SEASON_HTTP_PROBLEMS.originForbidden, { traceId }),
    };
  }
  const body = await readJsonBody(request, { maximumBytes: 8 * 1024 });
  if (!body.ok) {
    return {
      ok: false,
      response: problemResponse(problemForJsonBodyError(body.error), { traceId }),
    };
  }
  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) {
    return {
      ok: false,
      response: problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId }),
    };
  }
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) {
    return {
      ok: false,
      response: problemResponse(problemForIfMatchRevisionError(revision.error), { traceId }),
    };
  }
  return {
    ok: true,
    value: {
      body: body.value,
      expectedRevision: revision.revision,
      traceId,
      context: {
        actorUserAccountId,
        requestId: randomUUID(),
        idempotencyMaterial: idempotencyHashMaterial(idempotency.key, scope),
      },
    },
  };
}

export function rejectSeasonQuery(request: Request, traceId = readValidatedTraceId(request.headers)) {
  if (new URL(request.url).searchParams.size === 0) return null;
  return problemResponse(SEASON_HTTP_PROBLEMS.invalidInput, { traceId });
}

export function seasonMutationResponse(
  result: MutationResult<Record<string, unknown>>,
  traceId?: string,
) {
  const headers = new Headers();
  if (result.revision !== undefined) headers.set("ETag", formatRevisionEtag(result.revision));
  if (result.replayed) headers.set("Idempotency-Replayed", "true");
  return noStoreJsonResponse(result.body, {
    status: result.status,
    headers,
    traceId,
  });
}

export function seasonReadResponse(body: unknown, status = 200, traceId?: string) {
  return noStoreJsonResponse(body, { status, traceId });
}

export function seasonServiceErrorResponse(error: unknown, traceId?: string): Response {
  if (error instanceof SeasonServiceError) {
    const problem = {
      ACTIVE_SEASON_EXISTS: SEASON_HTTP_PROBLEMS.activeSeasonExists,
      APPLICATION_CLOSED: SEASON_HTTP_PROBLEMS.applicationClosed,
      APPLICATION_REVIEWED: SEASON_HTTP_PROBLEMS.applicationReviewed,
      DUPLICATE: SEASON_HTTP_PROBLEMS.conflict,
      FORBIDDEN: SEASON_HTTP_PROBLEMS.forbidden,
      IDEMPOTENCY_MISMATCH: SEASON_HTTP_PROBLEMS.idempotencyMismatch,
      INVALID_INPUT: SEASON_HTTP_PROBLEMS.invalidInput,
      INVALID_TRANSITION: SEASON_HTTP_PROBLEMS.invalidTransition,
      NO_ACTIVE_SEASON: SEASON_HTTP_PROBLEMS.conflict,
      NOT_FOUND: SEASON_HTTP_PROBLEMS.notFound,
      PLAYER_REQUIRED: SEASON_HTTP_PROBLEMS.playerRequired,
      PRECONDITION_FAILED: SEASON_HTTP_PROBLEMS.preconditionFailed,
    }[error.code];
    return problemResponse(problem, { traceId });
  }
  return problemResponse(SEASON_HTTP_PROBLEMS.serviceUnavailable, { traceId });
}

export function seasonUnavailableResponse(traceId?: string) {
  return problemResponse(SEASON_HTTP_PROBLEMS.serviceUnavailable, { traceId });
}

export function seasonRateLimitedResponse(retryAfterSeconds: number, traceId?: string) {
  return problemResponse(SEASON_HTTP_PROBLEMS.rateLimited, {
    traceId,
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}

export function seasonRateLimitUnavailableResponse(traceId?: string) {
  return problemResponse(SEASON_HTTP_PROBLEMS.rateLimitUnavailable, { traceId });
}
