import {
  KakaoAssistantError,
  parsePlayerSearchBody,
} from "@/modules/recruiting/kakao-assistant/domain";
import {
  kakaoAssistantErrorResponse,
  kakaoAssistantResponse,
  kakaoAssistantUnavailableResponse,
  prepareKakaoSignedJson,
} from "@/modules/recruiting/kakao-assistant/http";
import { getRuntimeKakaoAssistant } from "@/modules/recruiting/kakao-assistant/runtime";
import { isRuntimeKakaoFeatureEnabled } from "@/modules/recruiting/kakao-admin/runtime";
import { RECRUIT_KAKAO_ROOM_COMMAND } from "@/modules/recruiting/infrastructure/kakao-http-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const prepared = await prepareKakaoSignedJson(request, undefined, RECRUIT_KAKAO_ROOM_COMMAND);
  if (!prepared.ok) return prepared.response;
  try {
    const body = parsePlayerSearchBody(prepared.body);
    if (!await isRuntimeKakaoFeatureEnabled("playerSearchEnabled", body.query)) return kakaoAssistantUnavailableResponse(prepared.traceId);
    const service = getRuntimeKakaoAssistant();
    if (!service) return kakaoAssistantUnavailableResponse(prepared.traceId);
    return kakaoAssistantResponse(await service.searchPlayers({
      actorPrincipalId: process.env.KAKAO_WEBHOOK_PRINCIPAL_ID ?? "bot:kakao",
      intent: prepared.intent,
      requestKey: prepared.requestKey,
      scope: "BOT:KAKAO:SEARCH_PLAYER",
      query: body.query,
    }), prepared.traceId);
  } catch (error) {
    return kakaoAssistantErrorResponse(error instanceof Error ? error : new KakaoAssistantError("INVALID_INPUT"), prepared.traceId);
  }
}
