import { getRuntimeKakaoRoomRegistry } from "@/modules/recruiting/kakao-access/runtime";
import { KakaoRoomRegistryError } from "@/modules/recruiting/kakao-access/postgres-kakao-room-registry";
import { operationsActor, prepareOperationsMutation, requireOperationsApiSession } from "@/modules/operations/infrastructure/operations-http";
import { definePublicProblem, formatRevisionEtag, noStoreJsonResponse, problemResponse, readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

const problems = Object.freeze({ invalid: definePublicProblem({ code: "FORM_INVALID", status: 400, title: "입력값이 올바르지 않습니다.", detail: "방, 역할, 상태와 revision을 확인해 주세요." }), conflict: definePublicProblem({ code: "CONFLICT", status: 409, title: "현재 상태와 충돌합니다.", detail: "최신 방 목록을 불러온 뒤 다시 시도해 주세요." }), unavailable: definePublicProblem({ code: "KAKAO_REGISTRY_UNAVAILABLE", status: 503, title: "방 등록 정보를 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }) });

export async function GET(request: Request) {
  const auth = await requireOperationsApiSession("ADMIN"); if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers); if (new URL(request.url).searchParams.size) return problemResponse(problems.invalid, { traceId });
  const registry = getRuntimeKakaoRoomRegistry(); if (!registry) return problemResponse(problems.unavailable, { traceId });
  try { return noStoreJsonResponse(await registry.list(), { traceId }); } catch { return problemResponse(problems.unavailable, { traceId }); }
}

export async function POST(request: Request) {
  const auth = await requireOperationsApiSession("SUPER_ADMIN"); if (!auth.ok) return auth.response;
  const prepared = await prepareOperationsMutation(request, 8 * 1024); if (!prepared.ok) return prepared.response;
  const registry = getRuntimeKakaoRoomRegistry(); if (!registry) return problemResponse(problems.unavailable, { traceId: prepared.traceId });
  try {
    const body = prepared.body as Record<string, unknown>; const actor = operationsActor(auth.session);
    if (body.action === "CREATE_PAIRING" && typeof body.displayName === "string" && (body.capabilityProfile === "RECRUIT" || body.capabilityProfile === "FEATURES")) {
      const result = await registry.createPairing({ actor, targetRoomId: typeof body.targetRoomId === "string" ? body.targetRoomId : null, displayName: body.displayName, capabilityProfile: body.capabilityProfile, ttlMinutes: typeof body.ttlMinutes === "number" ? body.ttlMinutes : 10, metadata: prepared.metadata });
      return noStoreJsonResponse({ ok: true, ...result }, { status: 201, traceId: prepared.traceId, headers: result.replayed ? { "Idempotency-Replayed": "true" } : undefined });
    }
    if (body.action === "SET_ROOM_STATUS" && typeof body.roomId === "string" && (body.status === "ACTIVE" || body.status === "PAUSED" || body.status === "REVOKED")) {
      const result = await registry.setRoomStatus({ actor, roomId: body.roomId, status: body.status, metadata: prepared.metadata });
      return noStoreJsonResponse({ ok: true, ...result }, { traceId: prepared.traceId, headers: { ETag: formatRevisionEtag(result.revision), ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}) } });
    }
    if (body.action === "SET_MEMBER_ROLE" && typeof body.memberId === "string" && (body.role === "MEMBER" || body.role === "MANAGER" || body.role === "ADMIN")) {
      const result = await registry.setMemberRole({ actor, memberId: body.memberId, role: body.role, metadata: prepared.metadata });
      return noStoreJsonResponse({ ok: true, ...result }, { traceId: prepared.traceId, headers: { ETag: formatRevisionEtag(result.revision), ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}) } });
    }
    return problemResponse(problems.invalid, { traceId: prepared.traceId });
  } catch (error) {
    if (error instanceof KakaoRoomRegistryError && (error.code === "PRECONDITION_FAILED" || error.code === "CONFLICT")) return problemResponse(problems.conflict, { traceId: prepared.traceId });
    if (error instanceof KakaoRoomRegistryError && error.code === "INVALID_INPUT") return problemResponse(problems.invalid, { traceId: prepared.traceId });
    return problemResponse(problems.unavailable, { traceId: prepared.traceId });
  }
}
