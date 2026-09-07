import { createHash, randomUUID } from "node:crypto";

import { hasSameOrigin } from "@/modules/auth/application/mutation-request-guard";
import { transactionSessionActor } from "@/modules/auth/domain/transaction-session";
import type { AuthSession } from "@/modules/auth/domain/auth-session";
import { authorizeApiRole } from "@/modules/auth/infrastructure/server-authorization";
import { PrivateAssetError, PRIVATE_ASSET_CONTENT_TYPES, PRIVATE_ASSET_MAX_BYTES } from "@/modules/assets/domain/private-asset";
import type { PrivateAssetHumanActor } from "@/modules/assets/application/private-asset-policy";
import {
  definePublicProblem,
  formatRevisionEtag,
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

import { DisciplineApplicationError } from "../application/command-handler";
import {
  disciplineCommandRequestHash,
  hashDisciplineRequestKey,
  type DisciplineCommand,
} from "../application/commands";
import type { DisciplineAdminMutationResult, DisciplineCommandResult, DisciplineMutationEnvelope } from "../application/ports";

const problems = Object.freeze({
  conflict: definePublicProblem({ code: "DISCIPLINE_CONFLICT", status: 409, title: "현재 징계 상태에서는 처리할 수 없습니다.", detail: "최신 과제 상태를 확인한 뒤 다시 시도해 주세요." }),
  forbidden: definePublicProblem({ code: "FORBIDDEN", status: 403, title: "요청 권한이 없습니다.", detail: "승인된 소유자 또는 관리자 계정으로 다시 시도해 주세요." }),
  idempotency: definePublicProblem({ code: "IDEMPOTENCY_MISMATCH", status: 409, title: "멱등성 키가 다른 요청에 사용되었습니다.", detail: "새 Idempotency-Key로 다시 요청해 주세요." }),
  invalid: definePublicProblem({ code: "INVALID_DISCIPLINE_INPUT", status: 400, title: "입력 값이 올바르지 않습니다.", detail: "필수 값, 이미지 형식과 허용된 동작을 확인해 주세요." }),
  notFound: definePublicProblem({ code: "NOT_FOUND", status: 404, title: "요청한 항목을 찾을 수 없습니다.", detail: "주소, 소유권과 최신 상태를 확인해 주세요." }),
  origin: definePublicProblem({ code: "ORIGIN_FORBIDDEN", status: 403, title: "허용되지 않은 요청 출처입니다.", detail: "같은 사이트에서 다시 요청해 주세요." }),
  precondition: definePublicProblem({ code: "PRECONDITION_FAILED", status: 412, title: "다른 변경이 먼저 반영되었습니다.", detail: "목록을 새로고침한 뒤 최신 ETag로 다시 시도해 주세요." }),
  storage: definePublicProblem({ code: "PRIVATE_STORAGE_UNAVAILABLE", status: 503, title: "비공개 이미지 저장소를 사용할 수 없습니다.", detail: "운영 저장소가 연결될 때까지 원본 이미지를 다시 전송하지 마세요." }),
  unavailable: definePublicProblem({ code: "DISCIPLINE_SERVICE_UNAVAILABLE", status: 503, title: "징계 서비스를 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
  unauthenticated: definePublicProblem({ code: "UNAUTHENTICATED", status: 401, title: "로그인이 필요합니다.", detail: "해당 용도의 계정으로 로그인한 뒤 다시 시도해 주세요." }),
});

export async function requireDisciplineApiSession(role: "USER" | "ADMIN") {
  const decision = await authorizeApiRole(role);
  return decision.allowed
    ? { ok: true as const, session: decision.session }
    : { ok: false as const, response: problemResponse(decision.reason === "UNAUTHENTICATED" ? problems.unauthenticated : problems.forbidden) };
}

function sameOrigin(request: Request, traceId?: string) {
  return hasSameOrigin(request, process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN)
    ? null
    : problemResponse(problems.origin, { traceId });
}

export async function prepareDisciplineJsonMutation(request: Request, maximumBytes = 48 * 1024) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return { ok: false as const, response: problemResponse(problems.invalid, { traceId }) };
  const originProblem = sameOrigin(request, traceId);
  if (originProblem) return { ok: false as const, response: originProblem };
  const body = await readJsonBody(request, { maximumBytes });
  if (!body.ok) return { ok: false as const, response: problemResponse(problemForJsonBodyError(body.error), { traceId }) };
  const key = readIdempotencyKey(request.headers);
  if (!key.ok) return { ok: false as const, response: problemResponse(problemForIdempotencyKeyError(key.error), { traceId }) };
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) return { ok: false as const, response: problemResponse(problemForIfMatchRevisionError(revision.error), { traceId }) };
  const bodyDigestHex = createHash("sha256").update(JSON.stringify(body.value)).digest("hex");
  return { ok: true as const, body: body.value, requestKey: key.key.normalized, expectedRevision: revision.revision, bodyDigestHex, traceId };
}

function decodedFileName(value: string | null) {
  if (!value) return null;
  if (value.length > 768 || !/^[\x21-\x7e]+$/u.test(value)) return undefined;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 && decoded.length <= 255 ? decoded : undefined;
  } catch { return undefined; }
}

export function prepareDisciplineUpload(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return { ok: false as const, response: problemResponse(problems.invalid, { traceId }) };
  const originProblem = sameOrigin(request, traceId);
  if (originProblem) return { ok: false as const, response: originProblem };
  const key = readIdempotencyKey(request.headers);
  if (!key.ok) return { ok: false as const, response: problemResponse(problemForIdempotencyKeyError(key.error), { traceId }) };
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) return { ok: false as const, response: problemResponse(problemForIfMatchRevisionError(revision.error), { traceId }) };
  const sizeText = request.headers.get("content-length") ?? "";
  const byteSize = /^(?:0|[1-9][0-9]{0,7})$/u.test(sizeText) ? Number(sizeText) : -1;
  const contentType = request.headers.get("content-type") ?? "";
  const sha256Hex = request.headers.get("x-content-sha256") ?? "";
  const originalFileName = decodedFileName(request.headers.get("x-upload-file-name"));
  if (byteSize < 12 || byteSize > PRIVATE_ASSET_MAX_BYTES || !PRIVATE_ASSET_CONTENT_TYPES.includes(contentType as never) || !/^[a-f0-9]{64}$/u.test(sha256Hex) || originalFileName === undefined) {
    return { ok: false as const, response: problemResponse(problems.invalid, { traceId }) };
  }
  return { ok: true as const, requestKey: key.key.normalized, expectedRevision: revision.revision, traceId, byteSize, contentType, sha256Hex, originalFileName };
}

export function accountPrivateAssetActor(session: AuthSession): PrivateAssetHumanActor {
  return { userAccountId: session.userId, sessionId: session.sessionId, authVersion: session.authVersion, purpose: "ACCOUNT", role: session.role, approvalStatus: "APPROVED" };
}

export function adminPrivateAssetActor(session: AuthSession): PrivateAssetHumanActor {
  if (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") throw new Error("ADMIN_REQUIRED");
  return { userAccountId: session.userId, sessionId: session.sessionId, authVersion: session.authVersion, purpose: "ADMIN", role: session.role, approvalStatus: "APPROVED" };
}

export function makeDisciplineCommand(input: Readonly<{
  type: DisciplineCommand["type"];
  taskId: string;
  session: AuthSession;
  requestKey: string;
  expectedRevision: number;
  bodyDigestHex: string;
  payload: DisciplineCommand["payload"];
}>): DisciplineCommand {
  const admin = input.type === "REVIEW_EVIDENCE";
  const base = {
    type: input.type,
    taskId: input.taskId,
    metadata: {
      principalId: input.session.userId,
      requestId: randomUUID(),
      expectedRevision: input.expectedRevision,
      issuedAt: new Date().toISOString(),
      authorizationIntent: admin
        ? { kind: "ADMIN_TOTP" as const, sessionId: input.session.sessionId, minimumRole: input.session.role as "ADMIN" | "SUPER_ADMIN", authVersion: input.session.authVersion, requireTotp: true as const, transactionRecheck: true as const }
        : { kind: "ACCOUNT_SESSION" as const, sessionId: input.session.sessionId, role: input.session.role, authVersion: input.session.authVersion, transactionRecheck: true as const },
      idempotency: {
        scope: admin ? "admin:discipline:evidence:review" : "account:discipline:evidence:submit",
        keyHash: hashDisciplineRequestKey(input.requestKey),
        requestHash: new Uint8Array(32),
        bodyDigestHex: input.bodyDigestHex,
      },
    },
    payload: input.payload,
  } as DisciplineCommand;
  (base.metadata.idempotency as { requestHash: Uint8Array }).requestHash = disciplineCommandRequestHash(base);
  return base;
}

export function makeDisciplineAdminEnvelope(session: AuthSession, prepared: Readonly<{ requestKey: string; bodyDigestHex: string }>, scope: string): DisciplineMutationEnvelope {
  const keyHash = Buffer.from(hashDisciplineRequestKey(prepared.requestKey));
  return {
    actorSession: transactionSessionActor(session),
    requestId: randomUUID(),
    scope,
    keyHash,
    requestHash: createHash("sha256").update(`klol-v2:${scope}\0${prepared.bodyDigestHex}`).digest(),
  };
}

export function disciplineMutationResponse(result: DisciplineCommandResult | DisciplineAdminMutationResult, traceId?: string) {
  const body = "body" in result ? result.body : result;
  const status = "status" in result ? result.status : 200;
  return noStoreJsonResponse(body, { status, traceId, headers: { ETag: formatRevisionEtag(result.revision), ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}) } });
}

export function disciplineReadResponse(body: unknown, traceId?: string) { return noStoreJsonResponse(body, { traceId }); }

export function disciplinePrivateImageResponse(image: Readonly<{ bytes: Uint8Array; contentType: string }>, traceId?: string) {
  return new Response(Buffer.from(image.bytes), { status: 200, headers: noStoreSecurityHeaders({ contentType: image.contentType, traceId, headers: { "Content-Disposition": "inline; filename=discipline-evidence", "Permissions-Policy": "camera=(), microphone=(), geolocation=()" } }) });
}

export function disciplineErrorResponse(error: unknown, traceId?: string) {
  if (error instanceof PrivateAssetError) {
    return problemResponse(error.code === "ASSET_NOT_AVAILABLE" ? problems.notFound : error.code === "STORAGE_UNAVAILABLE" ? problems.storage : error.code === "DUPLICATE_ASSET" ? problems.conflict : problems.invalid, { traceId });
  }
  if (error instanceof DisciplineApplicationError) {
    const problem = error.message.startsWith("STALE_") ? problems.precondition : error.code === "NOT_FOUND" ? problems.notFound : error.code === "INVALID_AUTHORIZATION" ? problems.forbidden : error.code === "IDEMPOTENCY_MISMATCH" ? problems.idempotency : problems.invalid;
    return problemResponse(problem, { traceId });
  }
  if (error instanceof Error && /^(?:STALE_)/u.test(error.message)) return problemResponse(problems.precondition, { traceId });
  if (error instanceof Error && /^(?:DISCIPLINE_|DUPLICATE_|INVALID_)/u.test(error.message)) return problemResponse(problems.conflict, { traceId });
  return problemResponse(problems.unavailable, { traceId });
}

export function disciplineUnavailableResponse(traceId?: string) { return problemResponse(problems.unavailable, { traceId }); }
export function disciplineJobForbiddenResponse(traceId?: string) { return problemResponse(problems.forbidden, { traceId }); }
