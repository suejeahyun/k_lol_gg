import { randomUUID } from "node:crypto";

import {
  noStoreJsonResponse,
  problemForIdempotencyKeyError,
  problemForJsonBodyError,
  problemResponse,
  readIdempotencyKey,
  readJsonBody,
  readValidatedTraceId,
} from "@/platform/http";
import { getRuntimeKakaoRoomRegistry } from "@/modules/recruiting/kakao-access/runtime";
import { getRuntimeKakaoAssistant } from "@/modules/recruiting/kakao-assistant/runtime";
import { getRuntimeRecruitingService } from "@/modules/recruiting/infrastructure/runtime-recruiting";
import { getRuntimeOperationForms } from "@/modules/recruiting/operation-forms/runtime";
import { kakaoWebhookFailureResponse } from "@/modules/recruiting/kakao-access/http";
import { KakaoRoomRegistryError } from "@/modules/recruiting/kakao-access/postgres-kakao-room-registry";
import { kakaoWebhookSecrets, readBoundedKakaoRawBody } from "@/modules/recruiting/infrastructure/kakao-http-request";
import { KakaoV4CommandService } from "@/modules/recruiting/kakao-v4/application";
import { KakaoV4CommandDispatcher } from "@/modules/recruiting/kakao-v4/dispatcher";
import {
  KAKAO_V4_COMMAND_CONTRACT,
  KAKAO_V4_MAXIMUM_BODY_BYTES,
  parseKakaoV4CommandEnvelope,
  verifyKakaoV4Signature,
} from "@/modules/recruiting/kakao-v4/domain";
import { kakaoV4CommandFailureResponse, kakaoV4ProblemResponse } from "@/modules/recruiting/kakao-v4/http";

export const runtime = "nodejs";

const FORBIDDEN_IDENTITY_HEADERS = ["x-klol-room", "x-klol-channel", "x-klol-room-name", "x-klol-sender"] as const;
let service: KakaoV4CommandService | null = null;

function runtimeService() {
  if (service) return service;
  const registry = getRuntimeKakaoRoomRegistry();
  if (!registry) return null;
  const recruiting = getRuntimeRecruitingService();
  const assistant = getRuntimeKakaoAssistant();
  const operationForms = getRuntimeOperationForms();
  if (!recruiting || !assistant || !operationForms) return null;
  service = new KakaoV4CommandService(registry, new KakaoV4CommandDispatcher({
    recruiting,
    assistant,
    publicOrigin: process.env.V2_PUBLIC_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL,
    operationForms,
  }));
  return service;
}

function registryFailure(error: KakaoRoomRegistryError, traceId?: string) {
  if (
    error.code === "INSTALLATION_KEY_MISMATCH" || error.code === "INSTALLATION_REVOKED" ||
    error.code === "ROOM_BINDING_REQUIRED" || error.code === "ROOM_NOT_REGISTERED" ||
    error.code === "ROOM_PAUSED" || error.code === "ROOM_CAPABILITY_FORBIDDEN"
  ) return kakaoWebhookFailureResponse(error.code, traceId);
  return kakaoV4ProblemResponse("UNAVAILABLE", traceId);
}

export async function POST(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return kakaoV4ProblemResponse("QUERY_FORBIDDEN", traceId);
  if (FORBIDDEN_IDENTITY_HEADERS.some((header) => request.headers.has(header))) {
    return kakaoV4ProblemResponse("FORBIDDEN_IDENTITY_HEADER", traceId);
  }
  const rawBody = await readBoundedKakaoRawBody(request, KAKAO_V4_MAXIMUM_BODY_BYTES);
  if (!rawBody) return kakaoV4ProblemResponse("COMMAND_INVALID", traceId);
  const parsed = await readJsonBody(new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") ?? "" },
    body: rawBody,
  }), { maximumBytes: KAKAO_V4_MAXIMUM_BODY_BYTES });
  if (!parsed.ok) return problemResponse(problemForJsonBodyError(parsed.error), { traceId });
  const envelope = parseKakaoV4CommandEnvelope(parsed.value);
  if (!envelope) return kakaoV4ProblemResponse("COMMAND_INVALID", traceId);
  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) return problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId });
  if (idempotency.key.normalized !== envelope.eventId) return kakaoV4ProblemResponse("IDEMPOTENCY_MISMATCH", traceId);

  const keyId = request.headers.get("x-klol-key-id") ?? "";
  const verified = verifyKakaoV4Signature({
    envelope,
    rawBody,
    keyId,
    signature: request.headers.get("x-klol-signature") ?? "",
    secrets: kakaoWebhookSecrets(),
  });
  if (!verified.ok) {
    console.warn("KAKAO_V4_COMMAND_REJECTED", { code: verified.code, route: new URL(request.url).pathname, traceId: traceId ?? null });
    if (verified.code === "SIGNING_KEY_UNAVAILABLE") return kakaoV4ProblemResponse("SIGNING_KEY_UNAVAILABLE", traceId);
    if (verified.code === "TIMESTAMP_STALE") return kakaoV4ProblemResponse("TIMESTAMP_STALE", traceId);
    return kakaoV4ProblemResponse("SIGNATURE_INVALID", traceId);
  }

  const commandService = runtimeService();
  if (!commandService) return kakaoV4ProblemResponse("UNAVAILABLE", traceId);
  try {
    const result = await commandService.execute(envelope, keyId, { requestDigestHex: verified.requestDigestHex, requestId: traceId ?? randomUUID() });
    const replayHeaders = result.replayed ? { "Idempotency-Replayed": "true" } : undefined;
    if (result.kind === "NOT_IMPLEMENTED") return kakaoV4ProblemResponse("ROUTER_NOT_ENABLED", traceId, replayHeaders);
    return noStoreJsonResponse({
      version: KAKAO_V4_COMMAND_CONTRACT,
      profileId: envelope.profileId,
      eventId: envelope.eventId,
      reply: result.reply,
    }, { traceId, headers: replayHeaders });
  } catch (error) {
    if (error instanceof KakaoRoomRegistryError) return registryFailure(error, traceId);
    return kakaoV4CommandFailureResponse(error, traceId);
  }
}
