import { parseScheduledNoticeBody } from "@/modules/recruiting/kakao-assistant/domain";
import {
  kakaoAssistantErrorResponse,
  kakaoAssistantResponse,
  kakaoAssistantUnavailableResponse,
  prepareKakaoSignedJson,
} from "@/modules/recruiting/kakao-assistant/http";
import { getRuntimeKakaoAssistant } from "@/modules/recruiting/kakao-assistant/runtime-assistant";
import { isRuntimeKakaoFeatureEnabled } from "@/modules/recruiting/kakao-admin/runtime";
import { FEATURES_KAKAO_ROOM_COMMAND, MAXIMUM_KAKAO_BODY_BYTES } from "@/modules/recruiting/infrastructure/kakao-http-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Produces a signed read-only notice payload. Delivery remains an external bot responsibility. */
export async function POST(request: Request) {
  const prepared = await prepareKakaoSignedJson(request, MAXIMUM_KAKAO_BODY_BYTES, FEATURES_KAKAO_ROOM_COMMAND);
  if (!prepared.ok) return prepared.response;
  try {
    const body = parseScheduledNoticeBody(prepared.body);
    if (!await isRuntimeKakaoFeatureEnabled("scheduledNoticeEnabled")) return kakaoAssistantUnavailableResponse(prepared.traceId);
    const service = getRuntimeKakaoAssistant();
    if (!service) return kakaoAssistantUnavailableResponse(prepared.traceId);
    return kakaoAssistantResponse(await service.getScheduledNotice({
      actorPrincipalId: process.env.KAKAO_WEBHOOK_PRINCIPAL_ID ?? "bot:kakao",
      intent: prepared.intent,
      requestKey: prepared.requestKey,
      scope: "BOT:KAKAO:SCHEDULED_NOTICE",
      slot: body.slot,
    }), prepared.traceId);
  } catch (error) {
    return kakaoAssistantErrorResponse(error, prepared.traceId);
  }
}
