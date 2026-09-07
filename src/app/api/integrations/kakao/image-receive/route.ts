import { randomUUID } from "node:crypto";

import { parseKakaoImageReceiveBody } from "@/modules/recruiting/kakao-assistant/domain";
import { kakaoAssistantErrorResponse, kakaoAssistantResponse, prepareKakaoSignedJson } from "@/modules/recruiting/kakao-assistant/http";
import { getRuntimeKakaoImageReceive } from "@/modules/recruiting/kakao-assistant/runtime";
import { MAXIMUM_KAKAO_IMAGE_BODY_BYTES } from "@/modules/recruiting/infrastructure/kakao-http-request";
import { isRuntimeKakaoFeatureEnabled } from "@/modules/recruiting/kakao-admin/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const prepared = await prepareKakaoSignedJson(request, MAXIMUM_KAKAO_IMAGE_BODY_BYTES);
  if (!prepared.ok) return prepared.response;
  try {
    const command = parseKakaoImageReceiveBody(prepared.body);
    if (!await isRuntimeKakaoFeatureEnabled("imageReceiveEnabled")) return kakaoAssistantErrorResponse(new Error("disabled"), prepared.traceId);
    const service = getRuntimeKakaoImageReceive();
    if (!service) return kakaoAssistantErrorResponse(new Error("unavailable"), prepared.traceId);
    return kakaoAssistantResponse(await service.receive({
      actorPrincipalId: process.env.KAKAO_WEBHOOK_PRINCIPAL_ID ?? "bot:kakao",
      intent: prepared.intent,
      requestKey: prepared.requestKey,
      requestId: randomUUID(),
      scope: "kakao:image-receive",
      command,
    }), prepared.traceId);
  } catch (error) {
    return kakaoAssistantErrorResponse(error, prepared.traceId);
  }
}
