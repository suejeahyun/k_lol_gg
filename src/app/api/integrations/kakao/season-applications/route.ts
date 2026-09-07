import { randomUUID } from "node:crypto";

import { parseSeasonSnapshotBody } from "@/modules/recruiting/kakao-assistant/domain";
import { kakaoAssistantErrorResponse, kakaoAssistantResponse, prepareKakaoSignedJson } from "@/modules/recruiting/kakao-assistant/http";
import { getRuntimeKakaoAssistant } from "@/modules/recruiting/kakao-assistant/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const prepared = await prepareKakaoSignedJson(request);
  if (!prepared.ok) return prepared.response;
  try {
    const command = parseSeasonSnapshotBody(prepared.body);
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
