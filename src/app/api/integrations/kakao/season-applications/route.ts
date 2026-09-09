import { randomUUID } from "node:crypto";

import { parseSeasonSnapshotBody } from "@/modules/recruiting/kakao-assistant/domain";
import { kakaoAssistantErrorResponse, kakaoAssistantResponse, prepareKakaoSignedJson } from "@/modules/recruiting/kakao-assistant/http";
import { getRuntimeKakaoAssistant } from "@/modules/recruiting/kakao-assistant/runtime";
import { isRuntimeKakaoFeatureEnabled } from "@/modules/recruiting/kakao-admin/runtime";
import { MAXIMUM_KAKAO_BODY_BYTES, TRUSTED_KAKAO_SENDER_COMMAND } from "@/modules/recruiting/infrastructure/kakao-http-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const prepared = await prepareKakaoSignedJson(request, MAXIMUM_KAKAO_BODY_BYTES, TRUSTED_KAKAO_SENDER_COMMAND);
  if (!prepared.ok) return prepared.response;
  try {
    const command = parseSeasonSnapshotBody(prepared.body);
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
