import { randomUUID } from "node:crypto";

import { hasSameOrigin } from "@/modules/auth/application/mutation-request-guard";
import type { AuthSession } from "@/modules/auth/domain/auth-session";
import { transactionSessionActor } from "@/modules/auth/domain/transaction-session";
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
import { CompetitionCoreError } from "../core";
import type { DestructionCommandContext, DestructionMutationResult } from "./http-contract";

const problems = Object.freeze({
  forbidden: definePublicProblem({ code: "FORBIDDEN", status: 403, title: "멸망전 작업 권한이 없습니다.", detail: "승인 계정 소유권 또는 관리자 2단계 인증과 역할을 확인해 주세요." }),
  invalidInput: definePublicProblem({ code: "INVALID_INPUT", status: 400, title: "멸망전 요청이 올바르지 않습니다.", detail: "입력값과 허용된 조회 조건을 확인해 주세요." }),
  notFound: definePublicProblem({ code: "NOT_FOUND", status: 404, title: "멸망전을 찾을 수 없습니다.", detail: "주소와 대회 식별자를 확인해 주세요." }),
  conflict: definePublicProblem({ code: "INVALID_TRANSITION", status: 409, title: "현재 단계에서는 처리할 수 없습니다.", detail: "최신 단계와 참가자·팀·경매·대진 조건을 확인해 주세요." }),
  precondition: definePublicProblem({ code: "PRECONDITION_FAILED", status: 412, title: "멸망전 revision이 변경되었습니다.", detail: "최신 내용을 불러온 뒤 다시 시도해 주세요." }),
  idempotency: definePublicProblem({ code: "IDEMPOTENCY_MISMATCH", status: 409, title: "멱등성 키가 이미 사용되었습니다.", detail: "새 Idempotency-Key로 다시 요청해 주세요." }),
  origin: definePublicProblem({ code: "ORIGIN_FORBIDDEN", status: 403, title: "허용되지 않은 요청 출처입니다.", detail: "같은 사이트에서 다시 요청해 주세요." }),
  unavailable: definePublicProblem({ code: "DESTRUCTION_SERVICE_UNAVAILABLE", status: 503, title: "멸망전 저장소를 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
});

export async function prepareDestructionMutation(request: Request, session: AuthSession, scope: string): Promise<
  | { ok: true; value: { body: unknown; expectedRevision: number; context: DestructionCommandContext; traceId?: string } }
  | { ok: false; response: Response }
> {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size || !hasSameOrigin(request, process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN)) {
    return { ok: false, response: problemResponse(new URL(request.url).searchParams.size ? problems.invalidInput : problems.origin, { traceId }) };
  }
  const body = await readJsonBody(request, { maximumBytes: 64 * 1024 });
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

export function destructionReadResponse(body: unknown, revision?: number, traceId?: string) {
  return noStoreJsonResponse(body, { traceId, headers: revision === undefined ? undefined : { ETag: formatRevisionEtag(revision) } });
}

export function destructionMutationResponse(result: DestructionMutationResult, traceId?: string) {
  return noStoreJsonResponse(result.body, { status: result.body.commandType === "CREATE_DESTRUCTION" ? 201 : 200, traceId, headers: {
    ETag: formatRevisionEtag(result.revision),
    ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}),
  } });
}

export function destructionErrorResponse(error: unknown, traceId?: string) {
  if (error instanceof CompetitionCoreError) {
    const problem = error.code === "INVALID_COMMAND_CONTRACT" ? problems.idempotency
      : error.code === "PRECONDITION_FAILED" ? problems.precondition
        : ["INVALID_TRANSITION", "INVALID_ROSTER", "INVALID_FIXTURE", "INVALID_RESULT", "DUPLICATE_ID"].includes(error.code) ? problems.conflict
          : problems.invalidInput;
    return problemResponse(problem, { traceId });
  }
  if (error instanceof TypeError) return problemResponse(error.message === "FORBIDDEN" ? problems.forbidden : problems.invalidInput, { traceId });
  return problemResponse(problems.unavailable, { traceId });
}

export function destructionInvalidResponse(traceId?: string) { return problemResponse(problems.invalidInput, { traceId }); }
export function destructionNotFoundResponse(traceId?: string) { return problemResponse(problems.notFound, { traceId }); }
export function destructionUnavailableResponse(traceId?: string) { return problemResponse(problems.unavailable, { traceId }); }
