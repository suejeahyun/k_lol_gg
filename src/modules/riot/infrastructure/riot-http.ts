import { createHash, randomUUID } from "node:crypto";

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

import { RiotApplicationError } from "../application/riot-application";
import type { RiotCommandContext } from "../application/commands";
import type { RiotMutationResult } from "../application/riot-application";

const problems = Object.freeze({
  unauthenticated: definePublicProblem({ code: "UNAUTHENTICATED", status: 401, title: "로그인이 필요합니다.", detail: "요청에 맞는 계정으로 다시 로그인해 주세요." }),
  forbidden: definePublicProblem({ code: "FORBIDDEN", status: 403, title: "Riot 연동 권한이 없습니다.", detail: "승인 계정의 소유권 또는 관리자 2단계 인증을 확인해 주세요." }),
  invalid: definePublicProblem({ code: "INVALID_INPUT", status: 400, title: "Riot 연동 요청이 올바르지 않습니다.", detail: "Riot ID와 요청 형식을 확인해 주세요." }),
  notFound: definePublicProblem({ code: "NOT_FOUND", status: 404, title: "Riot 연동 정보를 찾을 수 없습니다.", detail: "연결 대상과 현재 상태를 확인해 주세요." }),
  conflict: definePublicProblem({ code: "CONFLICT", status: 409, title: "현재 상태에서는 처리할 수 없습니다.", detail: "연결·동기화 상태를 새로 불러온 뒤 다시 시도해 주세요." }),
  precondition: definePublicProblem({ code: "PRECONDITION_FAILED", status: 412, title: "Riot 연결 revision이 변경되었습니다.", detail: "최신 상태를 불러온 뒤 다시 시도해 주세요." }),
  idempotency: definePublicProblem({ code: "IDEMPOTENCY_MISMATCH", status: 409, title: "멱등성 키가 이미 사용되었습니다.", detail: "새 Idempotency-Key로 다시 요청해 주세요." }),
  cooldown: definePublicProblem({ code: "RIOT_SYNC_COOLDOWN", status: 429, title: "동기화를 잠시 기다려 주세요.", detail: "Retry-After 이후 다시 요청해 주세요." }),
  origin: definePublicProblem({ code: "ORIGIN_FORBIDDEN", status: 403, title: "허용되지 않은 요청 출처입니다.", detail: "같은 사이트에서 다시 요청해 주세요." }),
  unavailable: definePublicProblem({ code: "RIOT_INTEGRATION_UNAVAILABLE", status: 503, title: "Riot 연동을 사용할 수 없습니다.", detail: "운영 연동이 활성화될 때까지 잠시 기다려 주세요." }),
});

export async function requireRiotApiSession(role: AuthRole) {
  const decision = await authorizeApiRole(role);
  if (decision.allowed) return { ok: true as const, session: decision.session };
  return { ok: false as const, response: problemResponse(decision.reason === "UNAUTHENTICATED" ? problems.unauthenticated : problems.forbidden) };
}

function bodyDigest(body: unknown) {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export async function prepareRiotMutation(
  request: Request,
  session: AuthSession,
  scope: string,
  options: Readonly<{ revision: "required" | "none" }>,
) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return { ok: false as const, response: problemResponse(problems.invalid, { traceId }) };
  if (!hasSameOrigin(request, process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN)) {
    return { ok: false as const, response: problemResponse(problems.origin, { traceId }) };
  }
  const body = await readJsonBody(request, { maximumBytes: 16 * 1024 });
  if (!body.ok) return { ok: false as const, response: problemResponse(problemForJsonBodyError(body.error), { traceId }) };
  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) return { ok: false as const, response: problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId }) };
  const revision = options.revision === "required" ? readIfMatchRevision(request.headers) : { ok: true as const, revision: 0 };
  if (!revision.ok) return { ok: false as const, response: problemResponse(problemForIfMatchRevisionError(revision.error), { traceId }) };
  const context: RiotCommandContext = {
    principalId: session.userId,
    requestId: randomUUID(),
    issuedAt: new Date().toISOString(),
    authorizationIntent: session.purpose === "ADMIN"
      ? {
          kind: "ADMIN_TOTP",
          sessionId: session.sessionId,
          role: session.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN",
          authVersion: session.authVersion,
          minimumRole: session.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN",
          requireTotp: true,
          transactionRecheck: true,
        }
      : {
          kind: "OWNER_SESSION",
          sessionId: session.sessionId,
          role: session.role,
          authVersion: session.authVersion,
          transactionRecheck: true,
        },
    idempotencyKeyMaterial: idempotencyHashMaterial(idempotency.key, scope),
    bodyDigestHex: bodyDigest(body.value),
  };
  return { ok: true as const, value: { body: body.value, expectedRevision: revision.revision, context, traceId } };
}

export function riotMutationResponse(result: RiotMutationResult, traceId?: string, responseBody: unknown = result.body) {
  const revision = typeof result.body.revision === "number" ? result.body.revision : undefined;
  return noStoreJsonResponse(responseBody, {
    traceId,
    headers: {
      ...(revision === undefined ? {} : { ETag: formatRevisionEtag(revision) }),
      ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}),
    },
  });
}

export function riotReadResponse(body: unknown, revision?: number, traceId?: string) {
  return noStoreJsonResponse(body, { traceId, headers: revision === undefined ? undefined : { ETag: formatRevisionEtag(revision) } });
}

export function riotErrorResponse(error: unknown, traceId?: string) {
  if (error instanceof RiotApplicationError) {
    const problem = {
      FEATURE_DISABLED: problems.unavailable,
      INVALID_COMMAND: problems.invalid,
      NOT_FOUND: problems.notFound,
      FORBIDDEN: problems.forbidden,
      IDEMPOTENCY_MISMATCH: problems.idempotency,
      SYNC_COOLDOWN: problems.cooldown,
      NO_WORK: problems.notFound,
    }[error.code];
    return problemResponse(problem, {
      traceId,
      headers: error.code === "SYNC_COOLDOWN" && error.retryAfterSeconds
        ? { "Retry-After": String(error.retryAfterSeconds) }
        : undefined,
    });
  }
  if (error instanceof Error && error.message === "STALE_RIOT_REVISION") return problemResponse(problems.precondition, { traceId });
  if (error instanceof Error && /^INVALID_RIOT_/u.test(error.message)) return problemResponse(problems.invalid, { traceId });
  if (error instanceof Error && /RIOT_LINK_ALREADY_CONNECTED|RIOT_LINK_NOT_CONNECTED/u.test(error.message)) return problemResponse(problems.conflict, { traceId });
  return problemResponse(problems.unavailable, { traceId });
}

export function riotUnavailableResponse(traceId?: string) {
  return problemResponse(problems.unavailable, { traceId });
}

export function riotInvalidInputResponse(traceId?: string) {
  return problemResponse(problems.invalid, { traceId });
}

export function riotNotFoundResponse(traceId?: string) {
  return problemResponse(problems.notFound, { traceId });
}

export function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)));
}
