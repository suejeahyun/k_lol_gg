import { createHash, randomUUID } from "node:crypto";

import { transactionSessionActor } from "@/modules/auth/domain/transaction-session";
import type { AuthSession } from "@/modules/auth/domain/auth-session";
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

import { RecruitingApplicationError } from "../application/command-handler";
import {
  hashRecruitingRequestKey,
  recruitingCommandScope,
  sealRecruitingCommand,
  type RecruitingCommand,
  type RecruitingCommandActor,
} from "../application/commands";
import type { RecruitingCommandResult } from "../application/ports";

const problems = Object.freeze({
  conflict: definePublicProblem({ code: "RECRUIT_CONFLICT", status: 409, title: "현재 모집 상태에서는 처리할 수 없습니다.", detail: "최신 모집 상태를 확인한 뒤 다시 시도해 주세요." }),
  forbidden: definePublicProblem({ code: "FORBIDDEN", status: 403, title: "요청 권한이 없습니다.", detail: "승인된 계정 또는 관리자 계정으로 다시 시도해 주세요." }),
  idempotencyMismatch: definePublicProblem({ code: "IDEMPOTENCY_MISMATCH", status: 409, title: "멱등성 키가 다른 요청에 사용되었습니다.", detail: "새 Idempotency-Key로 다시 요청해 주세요." }),
  invalidInput: definePublicProblem({ code: "INVALID_INPUT", status: 400, title: "모집 입력이 올바르지 않습니다.", detail: "필수 항목, 날짜, 인원과 허용된 동작을 확인해 주세요." }),
  notFound: definePublicProblem({ code: "NOT_FOUND", status: 404, title: "모집을 찾을 수 없습니다.", detail: "주소와 접근 계정을 확인해 주세요." }),
  originForbidden: definePublicProblem({ code: "ORIGIN_FORBIDDEN", status: 403, title: "허용되지 않은 요청 출처입니다.", detail: "같은 사이트에서 다시 요청해 주세요." }),
  preconditionFailed: definePublicProblem({ code: "PRECONDITION_FAILED", status: 412, title: "다른 변경이 먼저 반영되었습니다.", detail: "최신 모집 상태와 ETag를 확인해 주세요." }),
  serviceUnavailable: definePublicProblem({ code: "RECRUITING_SERVICE_UNAVAILABLE", status: 503, title: "모집 서비스를 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
  unauthenticated: definePublicProblem({ code: "UNAUTHENTICATED", status: 401, title: "로그인이 필요합니다.", detail: "승인된 계정으로 로그인한 뒤 다시 시도해 주세요." }),
  webhookForbidden: definePublicProblem({ code: "WEBHOOK_FORBIDDEN", status: 401, title: "웹훅 인증에 실패했습니다.", detail: "서명, 전송 시각과 발신 설정을 확인해 주세요." }),
});

export async function requireRecruitingApiSession(requiredRole: "USER" | "ADMIN") {
  const decision = await authorizeApiRole(requiredRole);
  if (decision.allowed) return { ok: true as const, session: decision.session };
  return { ok: false as const, response: problemResponse(decision.reason === "UNAUTHENTICATED" ? problems.unauthenticated : problems.forbidden) };
}

export async function prepareRecruitingJsonMutation(request: Request, maximumBytes = 48 * 1_024) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return { ok: false as const, response: problemResponse(problems.invalidInput, { traceId }) };
  if (!hasSameOrigin(request, process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN)) {
    return { ok: false as const, response: problemResponse(problems.originForbidden, { traceId }) };
  }
  const body = await readJsonBody(request, { maximumBytes });
  if (!body.ok) return { ok: false as const, response: problemResponse(problemForJsonBodyError(body.error), { traceId }) };
  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) return { ok: false as const, response: problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId }) };
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) return { ok: false as const, response: problemResponse(problemForIfMatchRevisionError(revision.error), { traceId }) };
  const bodyDigestHex = createHash("sha256").update(JSON.stringify(body.value)).digest("hex");
  return { ok: true as const, body: body.value, requestKey: idempotency.key.normalized, expectedRevision: revision.revision, bodyDigestHex, traceId };
}

export function accountActor(session: AuthSession): RecruitingCommandActor {
  return {
    kind: "ACCOUNT",
    principalId: session.userId,
    sessionActor: transactionSessionActor(session),
    authorizationIntent: { kind: "APPROVED_ACCOUNT", transactionRecheck: true },
  };
}

export function adminActor(session: AuthSession): RecruitingCommandActor {
  if (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") throw new Error("Admin role required.");
  return {
    kind: "ADMIN",
    principalId: session.userId,
    sessionActor: transactionSessionActor(session),
    authorizationIntent: {
      kind: "ADMIN_TOTP",
      minimumRole: session.role,
      requireTotp: true,
      transactionRecheck: true,
    },
  };
}

export function makeRecruitingCommand(input: Readonly<{
  type: RecruitingCommand["type"];
  aggregateId: string;
  actor: RecruitingCommandActor;
  requestId?: string;
  requestKey: string;
  expectedRevision: number;
  bodyDigestHex: string;
  issuedAt?: Date;
  payload: unknown;
}>): RecruitingCommand {
  const command = {
    type: input.type,
    aggregateId: input.aggregateId,
    metadata: {
      actor: input.actor,
      requestId: input.requestId ?? randomUUID(),
      expectedRevision: input.expectedRevision,
      issuedAt: (input.issuedAt ?? new Date()).toISOString(),
      idempotency: {
        scope: recruitingCommandScope(input.actor.kind, input.type),
        keyHash: hashRecruitingRequestKey(input.requestKey),
        requestFingerprint: new Uint8Array(32),
        bodyDigestHex: input.bodyDigestHex,
      },
    },
    payload: input.payload,
  } as RecruitingCommand;
  return sealRecruitingCommand(command);
}

export function recruitingMutationResponse(result: RecruitingCommandResult, traceId?: string) {
  return noStoreJsonResponse(result.body, {
    status: result.body.commandType.startsWith("CREATE_") ? 201 : 200,
    traceId,
    headers: {
      ETag: formatRevisionEtag(result.revision),
      ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}),
    },
  });
}

export function recruitingReadResponse(body: unknown, traceId?: string) {
  return noStoreJsonResponse(body, { traceId });
}

export function recruitingErrorResponse(error: unknown, traceId?: string) {
  if (error instanceof RecruitingApplicationError) {
    const problem = {
      ALREADY_EXISTS: problems.conflict,
      FORBIDDEN: problems.forbidden,
      IDEMPOTENCY_MISMATCH: problems.idempotencyMismatch,
      INVALID_AUTHORIZATION_INTENT: problems.forbidden,
      INVALID_COMMAND: problems.invalidInput,
      NOT_FOUND: problems.notFound,
      REVISION_CONFLICT: problems.preconditionFailed,
      SESSION_STALE: problems.unauthenticated,
    }[error.code];
    return problemResponse(problem, { traceId });
  }
  if (error instanceof Error && ["RECRUIT_NOT_MUTABLE", "INVALID_SCRIM_TRANSITION"].includes(error.message)) {
    return problemResponse(problems.conflict, { traceId });
  }
  if (error instanceof Error && error.message === "STALE_RECRUIT_REVISION") {
    return problemResponse(problems.preconditionFailed, { traceId });
  }
  if (error instanceof Error && /^(?:INVALID_|DUPLICATE_|SAME_|RECRUIT_CAPACITY)/u.test(error.message)) {
    return problemResponse(problems.invalidInput, { traceId });
  }
  let current: unknown = error;
  while (current && typeof current === "object") {
    const details = current as { code?: string; cause?: unknown };
    if (details.code === "23505") return problemResponse(problems.conflict, { traceId });
    current = details.cause;
  }
  return problemResponse(problems.serviceUnavailable, { traceId });
}

export function recruitingUnavailableResponse(traceId?: string) {
  return problemResponse(problems.serviceUnavailable, { traceId });
}

export function recruitingWebhookForbiddenResponse(traceId?: string) {
  return problemResponse(problems.webhookForbidden, { traceId });
}
