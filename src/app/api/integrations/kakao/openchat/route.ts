import { parseOpenChatBody } from "@/modules/recruiting/kakao-assistant/domain";
import {
  kakaoAssistantErrorResponse,
  kakaoAssistantResponse,
  kakaoAssistantUnavailableResponse,
  prepareKakaoSignedJson,
} from "@/modules/recruiting/kakao-assistant/http";
import { getRuntimeKakaoAssistant } from "@/modules/recruiting/kakao-assistant/runtime-assistant";
import { isRuntimeKakaoFeatureEnabled } from "@/modules/recruiting/kakao-admin/runtime";
import { RECRUIT_KAKAO_ROOM_COMMAND } from "@/modules/recruiting/infrastructure/kakao-http-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const prepared = await prepareKakaoSignedJson(request, undefined, RECRUIT_KAKAO_ROOM_COMMAND);
  if (!prepared.ok) return prepared.response;
  try {
    const command = parseOpenChatBody(prepared.body);
    const feature = command.command === "STATUS" ? "recruitingEnabled" : "playerSearchEnabled";
    const operationMessage = "query" in command ? `${command.command} ${command.query}` : command.command;
    if (!await isRuntimeKakaoFeatureEnabled(feature, operationMessage)) return kakaoAssistantUnavailableResponse(prepared.traceId);
    const service = getRuntimeKakaoAssistant();
    if (!service) return kakaoAssistantUnavailableResponse(prepared.traceId);
    const common = {
      actorPrincipalId: process.env.KAKAO_WEBHOOK_PRINCIPAL_ID ?? "bot:kakao",
      intent: prepared.intent,
      requestKey: prepared.requestKey,
    };
    const result = command.command === "STATUS"
      ? await service.getOpenChatStatus({ ...common, scope: "BOT:KAKAO:OPENCHAT:STATUS" })
      : command.command === "SEARCH_PLAYER"
        ? await service.searchPlayers({ ...common, scope: "BOT:KAKAO:OPENCHAT:SEARCH_PLAYER", query: command.query })
        : command.command === "RECORD" || command.command === "RECENT"
          ? await service.getPlayerRecord({ ...common, scope: `BOT:KAKAO:OPENCHAT:${command.command}`, query: command.query, mode: command.command })
          : await service.getRanking({ ...common, scope: "BOT:KAKAO:OPENCHAT:RANKING" });
    return kakaoAssistantResponse(result, prepared.traceId);
  } catch (error) {
    return kakaoAssistantErrorResponse(error, prepared.traceId);
  }
}
