import { createHash, randomUUID } from "node:crypto";
import { hasSameOrigin } from "@/modules/auth/application/mutation-request-guard";
import { authorizeApiRole } from "@/modules/auth/infrastructure/server-authorization";
import {
  definePublicProblem, formatRevisionEtag, noStoreJsonResponse, problemForIdempotencyKeyError,
  problemForIfMatchRevisionError, problemForJsonBodyError, problemResponse, readIdempotencyKey,
  readIfMatchRevision, readJsonBody, readValidatedTraceId,
} from "@/platform/http";
import type { CommunityNetworkCommandMetadata, CommunityNetworkCommandResult } from "../application/ports";
import { COMMUNITY_NETWORK_LIMITS, CommunityNetworkError } from "../domain/community-network";

const problems = {
  unauthenticated: definePublicProblem({ code: "UNAUTHENTICATED", status: 401, title: "로그인이 필요합니다.", detail: "관리자로 다시 로그인해 주세요." }),
  forbidden: definePublicProblem({ code: "FORBIDDEN", status: 403, title: "요청 권한이 없습니다.", detail: "최고 관리자만 커뮤니티 등록 정보를 관리할 수 있습니다." }),
  origin: definePublicProblem({ code: "ORIGIN_FORBIDDEN", status: 403, title: "허용되지 않은 요청 출처입니다.", detail: "같은 사이트에서 다시 요청해 주세요." }),
  invalid: definePublicProblem({ code: "INVALID_COMMUNITY_NETWORK_INPUT", status: 400, title: "등록 정보가 올바르지 않습니다.", detail: "필수 항목, 고유 주소와 ID, 운영상한을 확인해 주세요. 기존 항목은 삭제하지 않고 보관 또는 비활성화해야 합니다." }),
  stale: definePublicProblem({ code: "PRECONDITION_FAILED", status: 412, title: "등록 정보가 이미 변경되었습니다.", detail: "최신 정보를 불러온 뒤 다시 저장해 주세요." }),
  idempotency: definePublicProblem({ code: "IDEMPOTENCY_MISMATCH", status: 409, title: "멱등성 키가 다른 요청에 사용되었습니다.", detail: "새 Idempotency-Key로 다시 요청해 주세요." }),
  unique: definePublicProblem({ code: "COMMUNITY_NETWORK_UNIQUE_CONFLICT", status: 409, title: "주소 또는 별칭이 이미 사용 중입니다.", detail: "다른 커뮤니티의 주소와 별칭을 확인해 주세요. 두 기존 값을 맞교환하려면 사용하지 않는 값을 거쳐 변경해 주세요." }),
  unavailable: definePublicProblem({ code: "COMMUNITY_NETWORK_UNAVAILABLE", status: 503, title: "커뮤니티 연결 등록을 사용할 수 없습니다.", detail: "기능 활성화와 저장소 준비 상태를 확인해 주세요." }),
};

export async function requireCommunityNetworkApiSession() {
  const decision = await authorizeApiRole("SUPER_ADMIN");
  if (decision.allowed) return { ok: true as const, session: decision.session };
  return { ok: false as const, response: problemResponse(decision.reason === "UNAUTHENTICATED" ? problems.unauthenticated : problems.forbidden) };
}

export async function prepareCommunityNetworkMutation(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return { ok: false as const, response: communityNetworkInvalidResponse(traceId) };
  if (!hasSameOrigin(request, process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN)) return { ok: false as const, response: problemResponse(problems.origin, { traceId }) };
  const body = await readJsonBody(request, { maximumBytes: COMMUNITY_NETWORK_LIMITS.requestBytes });
  if (!body.ok) return { ok: false as const, response: problemResponse(problemForJsonBodyError(body.error), { traceId }) };
  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) return { ok: false as const, response: problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId }) };
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) return { ok: false as const, response: problemResponse(problemForIfMatchRevisionError(revision.error), { traceId }) };
  return {
    ok: true as const, body: body.value, traceId,
    metadata: {
      requestId: randomUUID(), requestKey: idempotency.key.normalized, expectedRevision: revision.revision,
      requestHashHex: createHash("sha256").update(JSON.stringify({ body: body.value, expectedRevision: revision.revision })).digest("hex"),
    } satisfies CommunityNetworkCommandMetadata,
  };
}

export function communityNetworkMutationResponse(result: CommunityNetworkCommandResult, traceId?: string) {
  return noStoreJsonResponse(result.body, { status: result.status, traceId, headers: {
    ETag: formatRevisionEtag(result.revision), ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}),
  } });
}

export function communityNetworkErrorResponse(error: unknown, traceId?: string) {
  if (error instanceof CommunityNetworkError) {
    if (error.code === "SESSION_STALE") return problemResponse(problems.unauthenticated, { traceId });
    if (error.code === "STALE_COMMUNITY_NETWORK_REVISION") return problemResponse(problems.stale, { traceId });
    if (error.code === "IDEMPOTENCY_MISMATCH") return problemResponse(problems.idempotency, { traceId });
    if (error.code === "COMMUNITY_NETWORK_UNIQUE_CONFLICT") return problemResponse(problems.unique, { traceId });
    if (error.code.startsWith("INVALID_") || error.code === "COMMUNITY_NETWORK_REMOVAL_FORBIDDEN" || error.code === "COMMUNITY_NETWORK_ROOM_MOVE_FORBIDDEN") return communityNetworkInvalidResponse(traceId);
  }
  return communityNetworkUnavailableResponse(traceId);
}

export function communityNetworkUnavailableResponse(traceId?: string) { return problemResponse(problems.unavailable, { traceId }); }
export function communityNetworkInvalidResponse(traceId?: string) { return problemResponse(problems.invalid, { traceId }); }
