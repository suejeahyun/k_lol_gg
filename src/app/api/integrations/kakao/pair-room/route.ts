import { randomUUID } from "node:crypto";

import { verifyKakaoInstallationHttpRequest, recordKakaoWebhookRejection } from "@/modules/recruiting/infrastructure/kakao-http-request";
import { getRuntimeKakaoRoomRegistry } from "@/modules/recruiting/kakao-access/runtime";
import { KakaoRoomRegistryError } from "@/modules/recruiting/kakao-access/postgres-kakao-room-registry";
import { definePublicProblem, noStoreJsonResponse, problemForIdempotencyKeyError, problemResponse, readIdempotencyKey, readValidatedTraceId } from "@/platform/http";
import { legacyKakaoInstallationId } from "@/modules/recruiting/infrastructure/kakao-signature";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const problems = Object.freeze({
  invalid: definePublicProblem({ code: "FORM_INVALID", status: 400, title: "연결 코드가 올바르지 않습니다.", detail: "관리자가 발급한 8자리 일회용 코드를 확인해 주세요." }),
  expired: definePublicProblem({ code: "CONFLICT", status: 409, title: "연결 코드를 사용할 수 없습니다.", detail: "코드가 만료되었거나 이미 사용되었습니다. 새 코드를 발급받아 주세요." }),
  conflict: definePublicProblem({ code: "CONFLICT", status: 409, title: "이미 다른 방에 연결된 설치본입니다.", detail: "자동 병합하지 않았습니다. 사이트의 설치본 연결 정보를 확인해 주세요." }),
  unavailable: definePublicProblem({ code: "KAKAO_REGISTRY_UNAVAILABLE", status: 503, title: "설치본 연결 서비스를 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
});

export async function POST(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const verified = await verifyKakaoInstallationHttpRequest(request);
  if (!verified.ok) { recordKakaoWebhookRejection(verified.code, { route: new URL(request.url).pathname, traceId, request }); return problemResponse(definePublicProblem({ code: "INVALID_SIGNATURE", status: 401, title: "봇 설치 인증 실패", detail: "MessengerBot 설치본의 installation/key ID와 서명 설정을 확인해 주세요." }), { traceId }); }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(verified.value.rawBody)); } catch { return problemResponse(problems.invalid, { traceId }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).join("|") !== "code") return problemResponse(problems.invalid, { traceId });
  const registry = getRuntimeKakaoRoomRegistry();
  if (!registry) return problemResponse(problems.unavailable, { traceId });
  const idempotency = readIdempotencyKey(request.headers); if (!idempotency.ok) return problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId });
  try {
    const intent = verified.value.intent;
    const result = await registry.consumePairing({ installationPublicId: intent.installationId ?? legacyKakaoInstallationId(intent.keyId), senderFingerprint: intent.senderId, keyId: intent.keyId, botVersion: intent.botVersion, nonce: intent.nonce, bodyDigestHex: intent.bodyDigestHex, code: (body as { code?: unknown }).code, requestKey: idempotency.key.normalized, requestId: randomUUID() });
    return noStoreJsonResponse({ ok: true, roomId: result.roomId, status: result.status, role: result.role }, { status: 201, traceId, headers: result.replayed ? { "Idempotency-Replayed": "true" } : undefined });
  } catch (error) {
    if (error instanceof KakaoRoomRegistryError) {
      if (error.code === "INVALID_INPUT") return problemResponse(problems.invalid, { traceId });
      if (error.code === "INSTALLATION_KEY_MISMATCH") return problemResponse(definePublicProblem({ code: "INVALID_SIGNATURE", status: 401, title: "설치본 키가 일치하지 않습니다.", detail: "/봇버전의 installation/key ID와 서버 등록 정보를 확인해 주세요." }), { traceId });
      if (error.code === "INSTALLATION_REVOKED") return problemResponse(definePublicProblem({ code: "INSTALLATION_REVOKED", status: 403, title: "회수된 봇 설치본입니다.", detail: "/봇버전의 설치본 ID를 관리자에게 전달해 주세요." }), { traceId });
      if (error.code === "PAIRING_EXPIRED" || error.code === "PAIRING_REPLAY") return problemResponse(problems.expired, { traceId });
      if (error.code === "CONFLICT") return problemResponse(problems.conflict, { traceId });
    }
    return problemResponse(problems.unavailable, { traceId });
  }
}
