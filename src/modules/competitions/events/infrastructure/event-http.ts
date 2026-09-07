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
import { EventDomainError } from "../domain/event";
import type { EventCommandContext } from "../application/event-service";
import type { EventMutationResult } from "../application/ports";

const problems = Object.freeze({
  unauthenticated: definePublicProblem({ code: "UNAUTHENTICATED", status: 401, title: "로그인이 필요합니다.", detail: "요청에 맞는 계정으로 로그인해 주세요." }),
  forbidden: definePublicProblem({ code: "FORBIDDEN", status: 403, title: "이벤트전 작업 권한이 없습니다.", detail: "승인 계정의 소유권 또는 관리자 2단계 인증을 확인해 주세요." }),
  invalidInput: definePublicProblem({ code: "INVALID_INPUT", status: 400, title: "이벤트전 요청이 올바르지 않습니다.", detail: "입력값과 허용된 조회 조건을 확인해 주세요." }),
  notFound: definePublicProblem({ code: "NOT_FOUND", status: 404, title: "이벤트전을 찾을 수 없습니다.", detail: "주소와 이벤트 식별자를 확인해 주세요." }),
  conflict: definePublicProblem({ code: "INVALID_TRANSITION", status: 409, title: "현재 단계에서는 처리할 수 없습니다.", detail: "최신 이벤트 단계와 참가자·팀·대진 조건을 확인해 주세요." }),
  precondition: definePublicProblem({ code: "PRECONDITION_FAILED", status: 412, title: "이벤트 revision이 변경되었습니다.", detail: "최신 내용을 불러온 뒤 다시 시도해 주세요." }),
  idempotency: definePublicProblem({ code: "IDEMPOTENCY_MISMATCH", status: 409, title: "멱등성 키가 이미 사용되었습니다.", detail: "새 Idempotency-Key로 다시 요청해 주세요." }),
  origin: definePublicProblem({ code: "ORIGIN_FORBIDDEN", status: 403, title: "허용되지 않은 요청 출처입니다.", detail: "같은 사이트에서 다시 요청해 주세요." }),
  unavailable: definePublicProblem({ code: "EVENT_SERVICE_UNAVAILABLE", status: 503, title: "이벤트전 저장소를 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
});

export async function requireEventApiSession(role: AuthRole) {
  const decision = await authorizeApiRole(role);
  if (decision.allowed) return { ok: true as const, session: decision.session };
  return { ok: false as const, response: problemResponse(decision.reason === "UNAUTHENTICATED" ? problems.unauthenticated : problems.forbidden) };
}

export async function prepareEventMutation(request: Request, session: AuthSession, scope: string): Promise<
  | { ok: true; value: { body: unknown; expectedRevision: number; context: EventCommandContext; traceId?: string } }
  | { ok: false; response: Response }
> {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size || !hasSameOrigin(request, process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN)) {
    return { ok: false, response: problemResponse(new URL(request.url).searchParams.size ? problems.invalidInput : problems.origin, { traceId }) };
  }
  const body = await readJsonBody(request, { maximumBytes: 48 * 1024 });
  if (!body.ok) return { ok: false, response: problemResponse(problemForJsonBodyError(body.error), { traceId }) };
  const key = readIdempotencyKey(request.headers);
  if (!key.ok) return { ok: false, response: problemResponse(problemForIdempotencyKeyError(key.error), { traceId }) };
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) return { ok: false, response: problemResponse(problemForIfMatchRevisionError(revision.error), { traceId }) };
  return { ok: true, value: {
    body: body.value,
    expectedRevision: revision.revision,
    traceId,
    context: {
      actorSession: transactionSessionActor(session),
      purpose: session.purpose,
      requestId: randomUUID(),
      idempotencyMaterial: idempotencyHashMaterial(key.key, scope),
    },
  } };
}

export function eventReadResponse(body: unknown, revision?: number, traceId?: string) {
  return noStoreJsonResponse(body, { traceId, headers: revision === undefined ? undefined : { ETag: formatRevisionEtag(revision) } });
}

export function eventMutationResponse(result: EventMutationResult, traceId?: string) {
  return noStoreJsonResponse(result.body, { status: result.body.commandType === "CREATE_EVENT" ? 201 : 200, traceId, headers: {
    ETag: formatRevisionEtag(result.revision),
    ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}),
  } });
}

export function eventErrorResponse(error: unknown, traceId?: string) {
  if (error instanceof EventDomainError) {
    const problem = {
      APPLICATION_CLOSED: problems.conflict,
      DUPLICATE_PARTICIPANT: problems.conflict,
      IDEMPOTENCY_MISMATCH: problems.idempotency,
      INVALID_AUTHORIZATION_INTENT: problems.forbidden,
      INVALID_INPUT: problems.invalidInput,
      INVALID_RESULT: problems.conflict,
      INVALID_STATE: problems.conflict,
      NOT_FOUND: problems.notFound,
      PRECONDITION_FAILED: problems.precondition,
      REVISION_CONFLICT: problems.precondition,
    }[error.code];
    return problemResponse(problem, { traceId });
  }
  if (error instanceof TypeError) {
    return problemResponse(error.message === "FORBIDDEN" ? problems.forbidden : problems.invalidInput, { traceId });
  }
  return problemResponse(problems.unavailable, { traceId });
}

export function eventInvalidResponse(traceId?: string) { return problemResponse(problems.invalidInput, { traceId }); }
export function eventNotFoundResponse(traceId?: string) { return problemResponse(problems.notFound, { traceId }); }
export function eventUnavailableResponse(traceId?: string) { return problemResponse(problems.unavailable, { traceId }); }
