import { kakaoAssistantErrorResponse, kakaoSeasonMappingUnavailableResponse, prepareKakaoSignedJson } from "@/modules/recruiting/kakao-assistant/http";
import { KakaoAssistantError } from "@/modules/recruiting/kakao-assistant/domain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function exactFailClosedEnvelope(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new KakaoAssistantError("INVALID_INPUT");
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body).sort().join(",");
  const action = String(body.action);
  const expectedKeys = action === "STATUS" || action === "CANCEL"
    ? "action,seasonId"
    : "action,payload,seasonId";
  if (keys !== expectedKeys ||
      !["UPSERT", "CANCEL", "STATUS"].includes(action) ||
      (action === "UPSERT" && (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload))) ||
      typeof body.seasonId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(body.seasonId)) {
    throw new KakaoAssistantError("INVALID_INPUT");
  }
}

/** Fail closed until a durable Kakao sender -> approved account/player binding exists. */
export async function POST(request: Request) {
  const prepared = await prepareKakaoSignedJson(request);
  if (!prepared.ok) return prepared.response;
  try {
    exactFailClosedEnvelope(prepared.body);
    return kakaoSeasonMappingUnavailableResponse(prepared.traceId);
  } catch (error) {
    return kakaoAssistantErrorResponse(error, prepared.traceId);
  }
}
