import { parseOpenChatBody } from "@/modules/recruiting/kakao-assistant/domain";
import {
  kakaoAssistantErrorResponse,
  kakaoAssistantResponse,
  kakaoAssistantUnavailableResponse,
  prepareKakaoSignedJson,
} from "@/modules/recruiting/kakao-assistant/http";
import { getRuntimeKakaoAssistant } from "@/modules/recruiting/kakao-assistant/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const prepared = await prepareKakaoSignedJson(request);
  if (!prepared.ok) return prepared.response;
  try {
    const command = parseOpenChatBody(prepared.body);
    const service = getRuntimeKakaoAssistant();
    if (!service) return kakaoAssistantUnavailableResponse(prepared.traceId);
    const common = {
      actorPrincipalId: process.env.KAKAO_WEBHOOK_PRINCIPAL_ID ?? "bot:kakao",
      intent: prepared.intent,
      requestKey: prepared.requestKey,
    };
    const result = command.command === "STATUS"
      ? await service.getOpenChatStatus({ ...common, scope: "BOT:KAKAO:OPENCHAT:STATUS" })
      : await service.searchPlayers({ ...common, scope: "BOT:KAKAO:OPENCHAT:SEARCH_PLAYER", query: command.query });
    return kakaoAssistantResponse(result, prepared.traceId);
  } catch (error) {
    return kakaoAssistantErrorResponse(error, prepared.traceId);
  }
}
