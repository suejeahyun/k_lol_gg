import { randomUUID } from "node:crypto";

import type { RecruitingCommand } from "@/modules/recruiting/application/commands";
import { getRuntimeRecruitingService } from "@/modules/recruiting/infrastructure/runtime-recruiting";
import { parseRecruitingCommandBody } from "@/modules/recruiting/infrastructure/recruiting-input";
import {
  PUBLIC_KAKAO_ROOM_COMMAND,
  recordKakaoWebhookRejection,
  verifyKakaoHttpRequest,
} from "@/modules/recruiting/infrastructure/kakao-http-request";
import {
  makeRecruitingCommand,
  recruitingErrorResponse,
  recruitingMutationResponse,
  recruitingUnavailableResponse,
} from "@/modules/recruiting/infrastructure/recruiting-http";
import {
  problemForIdempotencyKeyError,
  problemForIfMatchRevisionError,
  problemForJsonBodyError,
  problemResponse,
  readIdempotencyKey,
  readIfMatchRevision,
  readJsonBody,
  readValidatedTraceId,
} from "@/platform/http";
import { isRuntimeKakaoFeatureEnabled } from "@/modules/recruiting/kakao-admin/runtime";
import { kakaoWebhookFailureResponse } from "@/modules/recruiting/kakao-access/http";
import { KakaoRoomRegistryError } from "@/modules/recruiting/kakao-access/postgres-kakao-room-registry";
import { legacyKakaoInstallationId } from "@/modules/recruiting/infrastructure/kakao-signature";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAXIMUM_BODY_BYTES = 256 * 1_024;
const BOT_TYPES: ReadonlySet<RecruitingCommand["type"]> = new Set([
  "CREATE_PARTY", "SYNC_PARTY", "GET_PARTY_STATUS", "FINISH_PARTY", "CANCEL_PARTY",
  "CREATE_SCRIM", "SYNC_SCRIM", "JOIN_SCRIM", "REOPEN_SCRIM", "CONFIRM_SCRIM", "COMPLETE_SCRIM", "CANCEL_SCRIM",
]);

export async function POST(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  // V1 party forms are collaboratively edited by human members of an approved room.
  // The raw-body HMAC, approved-room check, nonce claim and bot-self rejection remain mandatory.
  const verification = await verifyKakaoHttpRequest(request, new Date(), MAXIMUM_BODY_BYTES, PUBLIC_KAKAO_ROOM_COMMAND);
  if (!verification.ok) {
    recordKakaoWebhookRejection(verification.code, { route: new URL(request.url).pathname, traceId, request });
    return kakaoWebhookFailureResponse(verification.code, traceId);
  }
  const { rawBody, intent } = verification.value;
  if (!await isRuntimeKakaoFeatureEnabled("recruitingEnabled")) return recruitingUnavailableResponse(traceId);

  const parsedJson = await readJsonBody(new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") ?? "" },
    body: rawBody,
  }), { maximumBytes: MAXIMUM_BODY_BYTES });
  if (!parsedJson.ok) return problemResponse(problemForJsonBodyError(parsedJson.error), { traceId });
  const parsed = parseRecruitingCommandBody(parsedJson.value, BOT_TYPES, undefined, true);
  if (!parsed || !parsed.aggregateId) return recruitingErrorResponse(new Error("INVALID_WEBHOOK_COMMAND"), traceId);
  if (parsed.source === "RAW_V2") {
    const { getRuntimeKakaoRoomRegistry } = await import("@/modules/recruiting/kakao-access/runtime");
    const registry = getRuntimeKakaoRoomRegistry();
    try {
      if (!registry) throw new KakaoRoomRegistryError("UNAVAILABLE");
      await registry.authorize({ installationPublicId: intent.installationId ?? legacyKakaoInstallationId(intent.keyId), senderFingerprint: intent.senderId, requiredRole: "ADMIN", keyId: intent.keyId, botVersion: intent.botVersion });
    } catch {
      recordKakaoWebhookRejection("ROLE_FORBIDDEN", { route: new URL(request.url).pathname, traceId, request });
      return kakaoWebhookFailureResponse("ROLE_FORBIDDEN", traceId);
    }
  }
  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) return problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId });
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) return problemResponse(problemForIfMatchRevisionError(revision.error), { traceId });

  const service = getRuntimeRecruitingService();
  if (!service) return recruitingUnavailableResponse(traceId);
  try {
    const actor = {
      kind: "BOT" as const,
      principalId: process.env.KAKAO_WEBHOOK_PRINCIPAL_ID ?? "bot:kakao",
      authorizationIntent: intent,
    };
    const command = makeRecruitingCommand({
      type: parsed.type,
      aggregateId: parsed.aggregateId,
      actor,
      requestId: randomUUID(),
      requestKey: idempotency.key.normalized,
      expectedRevision: revision.revision,
      bodyDigestHex: intent.bodyDigestHex,
      issuedAt: new Date(intent.timestampSeconds * 1_000),
      payload: parsed.payload,
    });
    return recruitingMutationResponse(await service.handle(command), traceId);
  } catch (error) {
    return recruitingErrorResponse(error, traceId);
  }
}
