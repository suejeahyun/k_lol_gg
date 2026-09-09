import { randomUUID } from "node:crypto";

import { kakaoSeasonCommandAccess, parseSeasonSnapshotBody } from "@/modules/recruiting/kakao-assistant/domain";
import { kakaoAssistantCapabilityForbiddenResponse, kakaoAssistantErrorResponse, kakaoAssistantResponse, prepareKakaoSignedJson } from "@/modules/recruiting/kakao-assistant/http";
import { getRuntimeKakaoAssistant } from "@/modules/recruiting/kakao-assistant/runtime";
import { isRuntimeKakaoFeatureEnabled } from "@/modules/recruiting/kakao-admin/runtime";
import { MAXIMUM_KAKAO_BODY_BYTES, PUBLIC_KAKAO_ROOM_COMMAND, recordKakaoWebhookRejection, splitKakaoIdentifiers } from "@/modules/recruiting/infrastructure/kakao-http-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const prepared = await prepareKakaoSignedJson(request, MAXIMUM_KAKAO_BODY_BYTES, PUBLIC_KAKAO_ROOM_COMMAND);
  if (!prepared.ok) return prepared.response;
  try {
    const command = parseSeasonSnapshotBody(prepared.body);
    if (kakaoSeasonCommandAccess(command.action) === "TRUSTED_OPERATOR" &&
        !splitKakaoIdentifiers(process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS).has(prepared.intent.senderId)) {
      recordKakaoWebhookRejection("CAPABILITY_FORBIDDEN", { route: new URL(request.url).pathname, traceId: prepared.traceId });
      return kakaoAssistantCapabilityForbiddenResponse(prepared.traceId);
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
