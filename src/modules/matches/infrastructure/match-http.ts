import { createHash, randomUUID } from "node:crypto";

import { hasSameOrigin } from "@/modules/auth/application/mutation-request-guard";
import { resolveRateLimitClientKey } from "@/modules/auth/infrastructure/rate-limit-client-key";
import { authorizeApiRole } from "@/modules/auth/infrastructure/server-authorization";
import type { AuthSession } from "@/modules/auth/domain/auth-session";
import {
  definePublicProblem,
  formatRevisionEtag,
  idempotencyHashMaterial,
  noStoreJsonResponse,
  noStoreSecurityHeaders,
  problemForIdempotencyKeyError,
  problemForIfMatchRevisionError,
  problemForJsonBodyError,
  problemResponse,
  readIdempotencyKey,
  readIfMatchRevision,
  readJsonBody,
  readValidatedTraceId,
} from "@/platform/http";

import type {
  MatchCommandContext,
  SubmissionImageUploadDeclaration,
} from "../application/match-service";
import type { MatchMutationResult } from "../application/ports/match-repository";
import {
  MATCH_IMAGE_CONTENT_TYPES,
  MATCH_IMAGE_MAX_BYTES,
  MatchServiceError,
} from "../domain/match";
import { type MatchUploadBodyError, readExactUploadBody } from "./match-upload-body";

export { readExactUploadBody };

const MATCH_HTTP_PROBLEMS = Object.freeze({
  conflict: definePublicProblem({
    code: "RESOURCE_CONFLICT",
    status: 409,
    title: "현재 상태에서는 요청을 처리할 수 없습니다.",
    detail: "최신 경기 또는 접수 상태를 확인한 뒤 다시 시도해 주세요.",
  }),
  forbidden: definePublicProblem({
    code: "FORBIDDEN",
    status: 403,
    title: "이 작업을 수행할 권한이 없습니다.",
    detail: "현재 계정의 역할과 접수 소유권을 확인해 주세요.",
  }),
  idempotencyMismatch: definePublicProblem({
    code: "IDEMPOTENCY_MISMATCH",
    status: 409,
    title: "멱등성 키가 다른 요청에 사용되었습니다.",
    detail: "새 Idempotency-Key로 다시 요청해 주세요.",
  }),
  invalidImage: definePublicProblem({
    code: "INVALID_IMAGE",
    status: 400,
    title: "이미지 파일을 확인할 수 없습니다.",
    detail: "허용된 크기의 정상 PNG, JPEG 또는 WebP 단일 프레임을 사용해 주세요.",
  }),
  invalidInput: definePublicProblem({
    code: "INVALID_INPUT",
    status: 400,
    title: "입력 값이 올바르지 않습니다.",
    detail: "필수 값, 날짜, 식별자와 허용된 필드만 사용했는지 확인해 주세요.",
  }),
  notFound: definePublicProblem({
    code: "NOT_FOUND",
    status: 404,
    title: "요청한 항목을 찾을 수 없습니다.",
    detail: "주소, 소유권과 최신 상태를 확인해 주세요.",
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
    title: "다른 변경이 먼저 반영되었습니다.",
    detail: "최신 데이터를 불러온 뒤 현재 ETag로 다시 시도해 주세요.",
  }),
  privateStorageUnavailable: definePublicProblem({
    code: "PRIVATE_STORAGE_UNAVAILABLE",
    status: 503,
    title: "비공개 이미지 처리를 사용할 수 없습니다.",
    detail: "이미지 원본은 전송하지 말고 잠시 후 다시 시도해 주세요.",
  }),
  rateLimited: definePublicProblem({
    code: "RATE_LIMITED",
    status: 429,
    title: "업로드 요청이 너무 많습니다.",
    detail: "잠시 기다린 뒤 다시 시도해 주세요.",
  }),
  rateLimitUnavailable: definePublicProblem({
    code: "RATE_LIMIT_UNAVAILABLE",
    status: 503,
    title: "요청 제한 상태를 확인할 수 없습니다.",
    detail: "안전한 처리를 위해 잠시 후 다시 시도해 주세요.",
  }),
  serviceUnavailable: definePublicProblem({
    code: "MATCH_SERVICE_UNAVAILABLE",
    status: 503,
    title: "경기 서비스를 사용할 수 없습니다.",
    detail: "잠시 후 다시 시도해 주세요.",
  }),
  unauthenticated: definePublicProblem({
    code: "UNAUTHENTICATED",
    status: 401,
    title: "로그인이 필요합니다.",
    detail: "로그인한 뒤 다시 시도해 주세요.",
  }),
  uploadHeaders: definePublicProblem({
    code: "INVALID_UPLOAD_HEADERS",
    status: 400,
    title: "이미지 업로드 조건이 올바르지 않습니다.",
    detail: "Content-Length, Content-Type, SHA-256, 게임 번호 헤더를 확인해 주세요.",
  }),
  uploadLength: definePublicProblem({
    code: "INVALID_CONTENT_LENGTH",
    status: 400,
    title: "이미지 본문 길이가 선언과 다릅니다.",
    detail: "정확한 Content-Length로 이미지를 다시 전송해 주세요.",
  }),
  uploadTimeout: definePublicProblem({
    code: "UPLOAD_TIMEOUT",
    status: 408,
    title: "이미지 전송 시간이 초과되었습니다.",
    detail: "네트워크 상태를 확인한 뒤 파일을 다시 선택해 주세요.",
  }),
  uploadTooLarge: definePublicProblem({
    code: "BODY_TOO_LARGE",
    status: 413,
    title: "이미지 파일이 너무 큽니다.",
    detail: "4MiB 이하 이미지를 사용해 주세요.",
  }),
});

export type MatchSessionPurpose = "ACCOUNT" | "ADMIN";

export async function requireMatchApiSession(purpose: MatchSessionPurpose): Promise<
  | Readonly<{ ok: true; session: AuthSession }>
  | Readonly<{ ok: false; response: Response }>
> {
  const decision = await authorizeApiRole(purpose === "ADMIN" ? "ADMIN" : "USER");
  if (decision.allowed) {
    return { ok: true, session: decision.session };
  }
  return {
    ok: false,
    response: problemResponse(
      decision.reason === "UNAUTHENTICATED"
        ? MATCH_HTTP_PROBLEMS.unauthenticated
        : MATCH_HTTP_PROBLEMS.forbidden,
    ),
  };
}

function commandContext(
  request: Request,
  scope: string,
  session: AuthSession,
  purpose: MatchSessionPurpose,
  idempotencyKey: ReturnType<typeof readIdempotencyKey> & { ok: true },
): MatchCommandContext {
  return {
    actor:
      purpose === "ADMIN"
        ? {
            userAccountId: session.userId,
            sessionId: session.sessionId,
            purpose: "ADMIN",
            requiredRole: "ADMIN",
          }
        : {
            userAccountId: session.userId,
            sessionId: session.sessionId,
            purpose: "ACCOUNT",
            requiredRole: "USER",
          },
    requestId: randomUUID(),
    idempotencyMaterial: idempotencyHashMaterial(idempotencyKey.key, scope),
    rateLimitMaterial: new TextEncoder().encode(resolveRateLimitClientKey(request.headers)),
  };
}

function mutationHeaderGuard(
  request: Request,
  scope: string,
  session: AuthSession,
  purpose: MatchSessionPurpose,
) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size !== 0) {
    return { ok: false as const, response: problemResponse(MATCH_HTTP_PROBLEMS.invalidInput, { traceId }) };
  }
  const configuredOrigin = process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN;
  if (!hasSameOrigin(request, configuredOrigin)) {
    return {
      ok: false as const,
      response: problemResponse(MATCH_HTTP_PROBLEMS.originForbidden, { traceId }),
    };
  }
  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) {
    return {
      ok: false as const,
      response: problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId }),
    };
  }
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) {
    return {
      ok: false as const,
      response: problemResponse(problemForIfMatchRevisionError(revision.error), { traceId }),
    };
  }
  return {
    ok: true as const,
    traceId,
    expectedRevision: revision.revision,
    requestKey: idempotency.key.normalized,
    context: commandContext(request, scope, session, purpose, idempotency),
  };
}

export async function prepareMatchJsonMutation(
  request: Request,
  scope: string,
  session: AuthSession,
  purpose: MatchSessionPurpose,
  maximumBytes = 512 * 1024,
) {
  const headers = mutationHeaderGuard(request, scope, session, purpose);
  if (!headers.ok) return headers;
  const body = await readJsonBody(request, { maximumBytes });
  if (!body.ok) {
    return {
      ok: false as const,
      response: problemResponse(problemForJsonBodyError(body.error), { traceId: headers.traceId }),
    };
  }
  return {
    ...headers,
    body: body.value,
    bodyDigestHex: createHash("sha256").update(JSON.stringify(body.value)).digest("hex"),
  };
}

function decodedUploadFileName(value: string | null) {
  if (value === null || value === "") return null;
  if (value.length > 768 || !/^[\x21-\x7e]+$/.test(value)) return undefined;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length >= 1 && decoded.length <= 255 ? decoded : undefined;
  } catch {
    return undefined;
  }
}

export function prepareMatchUploadHeaders(
  request: Request,
  scope: string,
  session: AuthSession,
  submissionId: string,
  purpose: MatchSessionPurpose = "ACCOUNT",
) {
  const guarded = mutationHeaderGuard(request, scope, session, purpose);
  if (!guarded.ok) return guarded;
  const lengthValue = request.headers.get("content-length");
  const contentTypeValue = request.headers.get("content-type");
  const sha256Hex = request.headers.get("x-content-sha256");
  const gameNumberValue = request.headers.get("x-match-game-number");
  const originalFileName = decodedUploadFileName(request.headers.get("x-upload-file-name"));
  const byteSize = lengthValue && /^(?:0|[1-9][0-9]{0,7})$/.test(lengthValue)
    ? Number(lengthValue)
    : null;
  const gameNumber = gameNumberValue && /^[1-5]$/.test(gameNumberValue)
    ? Number(gameNumberValue)
    : null;
  const contentType = MATCH_IMAGE_CONTENT_TYPES.find((candidate) => candidate === contentTypeValue);
  if (
    byteSize === null ||
    byteSize < 12 ||
    byteSize > MATCH_IMAGE_MAX_BYTES ||
    !contentType ||
    !sha256Hex ||
    !/^[0-9a-f]{64}$/.test(sha256Hex) ||
    gameNumber === null ||
    originalFileName === undefined
  ) {
    const problem = byteSize !== null && byteSize > MATCH_IMAGE_MAX_BYTES
      ? MATCH_HTTP_PROBLEMS.uploadTooLarge
      : MATCH_HTTP_PROBLEMS.uploadHeaders;
    return { ok: false as const, response: problemResponse(problem, { traceId: guarded.traceId }) };
  }
  const declaration: SubmissionImageUploadDeclaration = {
    submissionId,
    expectedRevision: guarded.expectedRevision,
    gameNumber,
    contentType,
    byteSize,
    sha256Hex,
    originalFileName,
  };
  return { ...guarded, declaration };
}

export function uploadBodyProblem(error: MatchUploadBodyError, traceId?: string) {
  return problemResponse(
    error === "LENGTH"
      ? MATCH_HTTP_PROBLEMS.uploadLength
      : error === "TIMEOUT"
        ? MATCH_HTTP_PROBLEMS.uploadTimeout
        : MATCH_HTTP_PROBLEMS.invalidInput,
    { traceId },
  );
}

export function matchMutationResponse(
  result: MatchMutationResult<Record<string, unknown>>,
  traceId?: string,
) {
  const headers = new Headers();
  if (result.revision !== undefined) headers.set("ETag", formatRevisionEtag(result.revision));
  if (result.replayed) headers.set("Idempotency-Replayed", "true");
  return noStoreJsonResponse(result.body, { status: result.status, headers, traceId });
}

export function matchReadResponse(
  body: unknown,
  status = 200,
  traceId?: string,
  headers?: HeadersInit,
) {
  return noStoreJsonResponse(body, { status, traceId, headers });
}

export function matchPrivateImageResponse(
  image: Readonly<{
    bytes: Uint8Array;
    contentType: "image/png" | "image/jpeg" | "image/webp";
  }>,
  traceId?: string,
) {
  return new Response(Buffer.from(image.bytes), {
    status: 200,
    headers: noStoreSecurityHeaders({
      contentType: image.contentType,
      traceId,
      headers: {
        "Content-Disposition": "inline; filename=private-scoreboard",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      },
    }),
  });
}

export function matchServiceUnavailableResponse(traceId?: string) {
  return problemResponse(MATCH_HTTP_PROBLEMS.serviceUnavailable, { traceId });
}

export function matchNotFoundResponse(traceId?: string) {
  return problemResponse(MATCH_HTTP_PROBLEMS.notFound, { traceId });
}

export function matchInvalidInputResponse(traceId?: string) {
  return problemResponse(MATCH_HTTP_PROBLEMS.invalidInput, { traceId });
}

export function matchServiceErrorResponse(error: unknown, traceId?: string): Response {
  if (error instanceof MatchServiceError) {
    const problem = {
      DUPLICATE: MATCH_HTTP_PROBLEMS.conflict,
      FORBIDDEN: MATCH_HTTP_PROBLEMS.forbidden,
      IDEMPOTENCY_MISMATCH: MATCH_HTTP_PROBLEMS.idempotencyMismatch,
      IMAGE_LIMIT: MATCH_HTTP_PROBLEMS.conflict,
      INVALID_IMAGE: MATCH_HTTP_PROBLEMS.invalidImage,
      INVALID_INPUT: MATCH_HTTP_PROBLEMS.invalidInput,
      INVALID_TRANSITION: MATCH_HTTP_PROBLEMS.conflict,
      NOT_FOUND: MATCH_HTTP_PROBLEMS.notFound,
      PRECONDITION_FAILED: MATCH_HTTP_PROBLEMS.preconditionFailed,
      PRIVATE_STORAGE_UNAVAILABLE: MATCH_HTTP_PROBLEMS.privateStorageUnavailable,
      RATE_LIMITED: MATCH_HTTP_PROBLEMS.rateLimited,
      RATE_LIMIT_UNAVAILABLE: MATCH_HTTP_PROBLEMS.rateLimitUnavailable,
      SESSION_CHANGED: MATCH_HTTP_PROBLEMS.unauthenticated,
    }[error.code];
    return problemResponse(problem, {
      traceId,
      ...(error.code === "RATE_LIMITED" ? { headers: { "Retry-After": "60" } } : {}),
    });
  }
  return matchServiceUnavailableResponse(traceId);
}
