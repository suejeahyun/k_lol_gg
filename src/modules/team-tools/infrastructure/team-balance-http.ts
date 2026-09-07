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

import type { TeamBalanceCommandContext } from "../application/team-balance-service";
import type { TeamBalanceMutationResult } from "../application/ports/team-balance-repository";
import { TeamBalanceServiceError } from "../domain/team-balance-draft";
import { requireSiteFeature } from "@/modules/operations/infrastructure/site-feature-access";

const problems = Object.freeze({
  forbidden: definePublicProblem({ code: "FORBIDDEN", status: 403, title: "요청 권한이 없습니다.", detail: "이 팀 초안에 접근할 수 있는 계정으로 다시 시도해 주세요." }),
  idempotencyMismatch: definePublicProblem({ code: "IDEMPOTENCY_MISMATCH", status: 409, title: "멱등성 키가 이미 사용되었습니다.", detail: "새 Idempotency-Key로 다시 요청해 주세요." }),
  invalidInput: definePublicProblem({ code: "INVALID_INPUT", status: 400, title: "팀 입력이 올바르지 않습니다.", detail: "참가자 10명과 포지션·팀 배치를 확인해 주세요." }),
  invalidTransition: definePublicProblem({ code: "INVALID_TRANSITION", status: 409, title: "현재 상태에서는 변경할 수 없습니다.", detail: "최신 팀 초안 상태를 확인한 뒤 다시 시도해 주세요." }),
  notFound: definePublicProblem({ code: "NOT_FOUND", status: 404, title: "팀 초안을 찾을 수 없습니다.", detail: "주소 또는 접근 계정을 확인해 주세요." }),
  originForbidden: definePublicProblem({ code: "ORIGIN_FORBIDDEN", status: 403, title: "허용되지 않은 요청 출처입니다.", detail: "같은 사이트에서 다시 요청해 주세요." }),
  preconditionFailed: definePublicProblem({ code: "PRECONDITION_FAILED", status: 412, title: "다른 변경이 먼저 반영되었습니다.", detail: "최신 팀 초안을 불러온 뒤 다시 시도해 주세요." }),
  serviceUnavailable: definePublicProblem({ code: "TEAM_BALANCE_SERVICE_UNAVAILABLE", status: 503, title: "팀 도구를 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
  unauthenticated: definePublicProblem({ code: "UNAUTHENTICATED", status: 401, title: "로그인이 필요합니다.", detail: "승인된 계정으로 로그인한 뒤 다시 시도해 주세요." }),
});

export async function requireTeamBalanceApiSession(requiredRole: AuthRole, request: Request) {
  const decision = await authorizeApiRole(requiredRole);
  if (decision.allowed) {
    const featureFailure = await requireSiteFeature(request, "teamBalance");
    if (featureFailure) return { ok: false as const, response: featureFailure };
    return { ok: true as const, session: decision.session };
  }
  return {
    ok: false as const,
    response: problemResponse(decision.reason === "UNAUTHENTICATED" ? problems.unauthenticated : problems.forbidden),
  };
}

export async function prepareTeamBalanceMutation(request: Request, scope: string, session: AuthSession): Promise<
  | { ok: true; value: { body: unknown; expectedRevision: number; context: TeamBalanceCommandContext; traceId?: string } }
  | { ok: false; response: Response }
> {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return { ok: false, response: problemResponse(problems.invalidInput, { traceId }) };
  if (!hasSameOrigin(request, process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN)) {
    return { ok: false, response: problemResponse(problems.originForbidden, { traceId }) };
  }
  const body = await readJsonBody(request, { maximumBytes: 24 * 1024 });
  if (!body.ok) return { ok: false, response: problemResponse(problemForJsonBodyError(body.error), { traceId }) };
  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) return { ok: false, response: problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId }) };
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) return { ok: false, response: problemResponse(problemForIfMatchRevisionError(revision.error), { traceId }) };
  return {
    ok: true,
    value: {
      body: body.value,
      expectedRevision: revision.revision,
      traceId,
      context: {
        actorSession: transactionSessionActor(session),
        authorization: session.purpose === "ADMIN" ? "ADMIN_MUTATION" : "APPROVED_ACCOUNT_MUTATION",
        idempotencyMaterial: idempotencyHashMaterial(idempotency.key, scope),
        requestId: randomUUID(),
      },
    },
  };
}

export function teamBalanceMutationResponse(result: TeamBalanceMutationResult, traceId?: string) {
  return noStoreJsonResponse(result.body, {
    status: result.status,
    traceId,
    headers: {
      ETag: formatRevisionEtag(result.revision),
      ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}),
    },
  });
}

export function teamBalanceReadResponse(body: unknown, revision?: number, traceId?: string) {
  return noStoreJsonResponse(body, {
    traceId,
    headers: revision === undefined ? undefined : { ETag: formatRevisionEtag(revision) },
  });
}

export function teamBalanceErrorResponse(error: unknown, traceId?: string) {
  if (error instanceof TeamBalanceServiceError) {
    const problem = {
      FORBIDDEN: problems.forbidden,
      IDEMPOTENCY_MISMATCH: problems.idempotencyMismatch,
      INVALID_INPUT: problems.invalidInput,
      INVALID_TRANSITION: problems.invalidTransition,
      NOT_FOUND: problems.notFound,
      PRECONDITION_FAILED: problems.preconditionFailed,
      SESSION_STALE: problems.unauthenticated,
    }[error.code];
    return problemResponse(problem, { traceId });
  }
  return problemResponse(problems.serviceUnavailable, { traceId });
}

export function teamBalanceUnavailableResponse(traceId?: string) {
  return problemResponse(problems.serviceUnavailable, { traceId });
}
