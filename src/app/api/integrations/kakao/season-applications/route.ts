import { randomUUID } from "node:crypto";

import { kakaoSeasonCommandAccess, parseSeasonSnapshotBody } from "@/modules/recruiting/kakao-assistant/domain";
import { kakaoAssistantCapabilityForbiddenResponse, kakaoAssistantErrorResponse, kakaoAssistantResponse, prepareKakaoSignedJson } from "@/modules/recruiting/kakao-assistant/http";
import { getRuntimeKakaoAssistant } from "@/modules/recruiting/kakao-assistant/runtime-assistant";
import { isRuntimeKakaoFeatureEnabled } from "@/modules/recruiting/kakao-admin/runtime";
import { FEATURES_KAKAO_ROOM_COMMAND, MAXIMUM_KAKAO_BODY_BYTES, recordKakaoWebhookRejection } from "@/modules/recruiting/infrastructure/kakao-http-request";
import { KakaoRoomRegistryError } from "@/modules/recruiting/kakao-access/postgres-kakao-room-registry";
import { legacyKakaoInstallationId } from "@/modules/recruiting/infrastructure/kakao-signature";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const prepared = await prepareKakaoSignedJson(request, MAXIMUM_KAKAO_BODY_BYTES, FEATURES_KAKAO_ROOM_COMMAND);
  if (!prepared.ok) return prepared.response;
  try {
    const command = parseSeasonSnapshotBody(prepared.body);
    if (kakaoSeasonCommandAccess(command.action) === "TRUSTED_OPERATOR") {
      const { getRuntimeKakaoRoomRegistry } = await import("@/modules/recruiting/kakao-access/runtime");
      const registry = getRuntimeKakaoRoomRegistry();
      try {
        if (!registry) throw new KakaoRoomRegistryError("UNAVAILABLE");
        await registry.authorize({ installationPublicId: prepared.intent.installationId ?? legacyKakaoInstallationId(prepared.intent.keyId), senderFingerprint: prepared.intent.senderId, requiredRole: "ADMIN", keyId: prepared.intent.keyId, botVersion: prepared.intent.botVersion });
      } catch {
        recordKakaoWebhookRejection("ROLE_FORBIDDEN", { route: new URL(request.url).pathname, traceId: prepared.traceId, request });
        return kakaoAssistantCapabilityForbiddenResponse(prepared.traceId);
      }
    }
    if (!await isRuntimeKakaoFeatureEnabled("seasonApplicationsEnabled")) return kakaoAssistantErrorResponse(new Error("disabled"), prepared.traceId);
    const service = getRuntimeKakaoAssistant();
    if (!service) return kakaoAssistantErrorResponse(new Error("unavailable"), prepared.traceId);
    return kakaoAssistantResponse(await service.syncSeasonSnapshot({
      actorPrincipalId: process.env.KAKAO_WEBHOOK_PRINCIPAL_ID ?? "bot:kakao",
      intent: prepared.intent,
      requestKey: prepared.requestKey,
      scope: `kakao:season-applications:${command.action.toLowerCase()}`,
      command,
      requestId: randomUUID(),
    }), prepared.traceId);
  } catch (error) {
    return kakaoAssistantErrorResponse(error, prepared.traceId);
  }
}
